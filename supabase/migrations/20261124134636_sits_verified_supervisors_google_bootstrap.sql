-- SITS Salud: invitados institucionales autorizados y vinculación verificada con Google.
-- Ambas cuentas fueron designadas explícitamente como supervisores principales.
insert into public.sits_staff_invitations (email,role,active,issued_by)
values
 ('salud@sanpedro-valle.gov.co','supervisor',true,null),
 ('adminterritorial@sanpedro-valle.gov.co','supervisor',true,null)
on conflict (email) do update
set role='supervisor',active=true,claimed_by=null,claimed_at=null;

-- La presencia de una fila en staff no da privilegios sin una identidad
-- Google verificada y un email institucional confirmado.
create or replace function public.sits_session_access()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_email text; v_role text;
begin
 if v_uid is null or coalesce(auth.jwt()->>'is_anonymous','false')='true'
  then raise exception 'not_authenticated' using errcode='28000'; end if;
 select lower(u.email) into v_email from auth.users u
  where u.id=v_uid and u.email_confirmed_at is not null and u.banned_until is null;
 if v_email is null then raise exception 'email_not_verified' using errcode='28000'; end if;
 select s.role::text into v_role from public.sits_staff_members s
  where s.user_id=v_uid and s.active=true and s.institutional_email=v_email
   and v_email like '%@sanpedro-valle.gov.co'
   and exists(select 1 from auth.identities i
      where i.user_id=v_uid and i.provider='google'
       and lower(i.identity_data->>'email')=v_email);
 return jsonb_build_object('userId',v_uid,'email',v_email,'role',v_role,
   'canManage',v_role in ('admin','supervisor'),'institutional',v_role is not null);
end;
$$;

-- Los usuarios existentes que llegaron por el proveedor Email pueden vincularse
-- al UID real de Google SOLO al reclamar una invitación institucional vigente.
create or replace function public.sits_claim_staff_invitation()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_email text;
 v_inv public.sits_staff_invitations%rowtype; v_old_uid uuid;
begin
 if v_uid is null or coalesce(auth.jwt()->>'is_anonymous','false')='true'
  then raise exception 'not_authenticated' using errcode='28000'; end if;
 select lower(email) into v_email from auth.users
  where id=v_uid and email_confirmed_at is not null and banned_until is null;
 if v_email is null or v_email !~ '^[a-z0-9._%+-]+@sanpedro-valle[.]gov[.]co$'
  then raise exception 'forbidden' using errcode='42501'; end if;
 if not exists(select 1 from auth.identities i where i.user_id=v_uid
   and i.provider='google' and lower(i.identity_data->>'email')=v_email)
  then raise exception 'google_identity_required' using errcode='42501'; end if;
 select * into v_inv from public.sits_staff_invitations
  where email=v_email and active=true for update;
 if not found then raise exception 'invitation_required' using errcode='42501'; end if;
 if v_inv.claimed_by is not null and v_inv.claimed_by<>v_uid
  then raise exception 'invitation_already_claimed' using errcode='42501'; end if;
 select user_id into v_old_uid from public.sits_staff_members
  where institutional_email=v_email for update;
 if v_old_uid is not null and v_old_uid<>v_uid then
  -- No reemplazar identidad si hay expedientes o registros vinculados al UID anterior.
  if exists(select 1 from public.sits_cases where updated_by=v_old_uid)
    or exists(select 1 from public.sits_case_events where actor_user_id=v_old_uid)
    or exists(select 1 from public.sits_audit_events where actor_user_id=v_old_uid)
  then raise exception 'identity_reconciliation_required' using errcode='42501'; end if;
  update public.sits_staff_members
    set user_id=v_uid,role=v_inv.role,active=true,updated_at=now()
    where institutional_email=v_email;
 else
  insert into public.sits_staff_members (user_id,institutional_email,role,active)
  values (v_uid,v_email,v_inv.role,true)
  on conflict (user_id) do update
    set role=excluded.role,active=true,updated_at=now()
    where public.sits_staff_members.institutional_email=v_email;
 end if;
 update public.sits_staff_invitations
  set claimed_by=v_uid,claimed_at=coalesce(claimed_at,now())
  where email=v_email;
 insert into public.sits_audit_events(actor_user_id,event_type,entity_type,entity_id)
  values (v_uid,'staff:invitation_claimed','staff',v_uid::text);
 return public.sits_session_access();
end;
$$;
revoke all on function public.sits_session_access() from public,anon;
revoke all on function public.sits_claim_staff_invitation() from public,anon;
grant execute on function public.sits_session_access() to authenticated;
grant execute on function public.sits_claim_staff_invitation() to authenticated;