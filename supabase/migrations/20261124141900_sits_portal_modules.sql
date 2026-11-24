-- Private persistence for the existing versioned catalog, notices and pilot workflows.
-- Apps Script owns their authorization and sends only validated operations.
create table public.sits_portal_records (
  collection text not null check (collection in ('audit','rateLimits','institutional',
    'institutionalVersions','legalEvidence','rightsCases','catalog','serviceVersions','serviceRequests')),
  record_id text not null check (record_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision bigint not null default 1,
  primary key (collection, record_id)
);
alter table public.sits_portal_records enable row level security;
revoke all on public.sits_portal_records from public, anon, authenticated;
grant select, insert, update on public.sits_portal_records to service_role;
create index sits_portal_owner_time on public.sits_portal_records
  (collection, (data->>'ownerUid'), (data->'createdAt') desc, record_id desc);
create index sits_portal_event_time on public.sits_portal_records
  (collection, (data->'at') desc, record_id desc);

create function public.sits_portal_query(
  _collection text, _field text, _value jsonb, _contains boolean,
  _sort text, _limit integer, _after jsonb, _after_id text
) returns setof public.sits_portal_records
language sql stable set search_path = ''
as $$
  select r.* from public.sits_portal_records r
  where r.collection = _collection
    and r.data ? _sort
    and (_field is null or case when _contains then r.data->_field @> jsonb_build_array(_value)
      else r.data->_field = _value end)
    and (_after_id is null or (r.data->_sort, r.record_id) < (_after, _after_id))
  order by r.data->_sort desc, r.record_id desc
  limit least(greatest(_limit, 1), 100);
$$;

create function public.sits_portal_commit(_writes jsonb)
returns void language plpgsql set search_path = ''
as $$
declare
  w jsonb;
  v_collection text;
  v_id text;
  v_revision bigint;
  v_data jsonb;
  v_time jsonb := to_jsonb(floor(extract(epoch from statement_timestamp()) * 1000)::bigint);
  v_field text;
begin
  if jsonb_typeof(_writes) <> 'array' or jsonb_array_length(_writes) not between 1 and 30 then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  -- Serializes short commits, including assertions that a record does not exist.
  perform pg_advisory_xact_lock(593624011);
  for w in select value from jsonb_array_elements(_writes) loop
    v_collection := w->>'collection';
    v_id := w->>'id';
    select revision into v_revision from public.sits_portal_records
      where collection = v_collection and record_id = v_id;
    if v_revision is distinct from (w->>'revision')::bigint then
      raise exception 'content_version_changed' using errcode = '23505';
    end if;
    if not (w ? 'data') then continue; end if;
    v_data := w->'data';
    for v_field in select value from jsonb_array_elements_text(w->'timestamps') loop
      v_data := v_data || jsonb_build_object(v_field, v_time);
    end loop;
    if v_revision is null then
      insert into public.sits_portal_records(collection,record_id,data) values(v_collection,v_id,v_data);
    else
      update public.sits_portal_records set data = data || v_data, revision = revision + 1
        where collection = v_collection and record_id = v_id;
    end if;
    if v_collection = 'institutional' and v_id in ('policy-processing','policy-privacy','policy-terms','policy-sensitive')
      and v_data->>'state' in ('published','withdrawn') then
      update public.sits_legal_documents set active=false where id=v_id and active;
      if v_data->>'state' = 'published' then
        insert into public.sits_legal_documents(id,version,kind,title,body,content_hash)
        values (v_id,(v_data->'published'->>'version')::integer, v_data->'published'->>'kind',
          v_data->'published'->>'title',v_data->'published'->>'body',v_data->'published'->>'hash');
      else
        update public.sits_legal_documents set active=true where id=v_id and version=1;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.sits_portal_query(text,text,jsonb,boolean,text,integer,jsonb,text) from public, anon, authenticated;
revoke all on function public.sits_portal_commit(jsonb) from public, anon, authenticated;
grant execute on function public.sits_portal_query(text,text,jsonb,boolean,text,integer,jsonb,text) to service_role;
grant execute on function public.sits_portal_commit(jsonb) to service_role;

grant select, insert, update on public.sits_legal_documents to service_role;

alter table public.sits_staff_invitations add column expires_at timestamptz;
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
  where email=v_email and active=true and (expires_at is null or expires_at>now()) for update;
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

-- Regular invitations must use the application workflow with expiry. The original
-- function stays versioned for rollback but is no longer an authenticated API.
revoke execute on function public.sits_issue_staff_invitation(text,public.sits_staff_role) from authenticated;

create function public.sits_portal_staff(_actor uuid,_action text,_input jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(_input->>'email'));
  v_role public.sits_staff_role;
  v_target uuid;
  v_inv public.sits_staff_invitations%rowtype;
  v_expires timestamptz := now() + interval '7 days';
  v_active boolean;
begin
  if not exists (
    select 1 from public.sits_staff_members s
    join auth.users u on u.id=s.user_id
    join auth.identities i on i.user_id=u.id and i.provider='google'
    where s.user_id=_actor and s.active and s.role='supervisor'
      and lower(u.email)=s.institutional_email and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<=now())
      and lower(i.identity_data->>'email')=s.institutional_email
  ) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if _action='staffList' then
    return jsonb_build_object(
      'items', (select coalesce(jsonb_agg(jsonb_build_object('uid',s.user_id,'email',s.institutional_email,
        'role',s.role,'active',s.active) order by s.institutional_email),'[]'::jsonb) from public.sits_staff_members s),
      'invitations', (select coalesce(jsonb_agg(jsonb_build_object('email',i.email,'role',i.role,
        'state',case when i.claimed_by is not null then 'claimed' when not i.active then 'revoked'
          when i.expires_at<=now() then 'expired' else 'pending' end,
        'expiresAt',floor(extract(epoch from i.expires_at)*1000)) order by i.issued_at desc),'[]'::jsonb)
        from public.sits_staff_invitations i)
    );
  end if;
  if v_email is null or v_email !~ '^[a-z0-9._%+-]+@sanpedro-valle[.]gov[.]co$' then
    raise exception 'invalid_request' using errcode='22023';
  end if;
  if _action='staffSave' then
    v_target := (_input->>'uid')::uuid;
    v_role := (_input->>'role')::public.sits_staff_role;
    v_active := (_input->>'active')::boolean;
    if v_target=_actor or v_role is null or v_role='supervisor' or v_active is null then
      raise exception 'forbidden' using errcode='42501';
    end if;
    update public.sits_staff_members set role=v_role,active=v_active,updated_at=now()
      where user_id=v_target and institutional_email=v_email and role<>'supervisor';
    if not found then raise exception 'forbidden' using errcode='42501'; end if;
  elsif _action in ('staffInvite','staffRevokeInvite') then
    select * into v_inv from public.sits_staff_invitations where email=v_email for update;
    if v_inv.role='supervisor' or v_inv.claimed_by is not null
      or exists(select 1 from public.sits_staff_members where institutional_email=v_email) then
      raise exception 'forbidden' using errcode='42501';
    end if;
    if _action='staffInvite' then
      v_role := (_input->>'role')::public.sits_staff_role;
      if v_role is null or v_role='supervisor' then raise exception 'forbidden' using errcode='42501'; end if;
      insert into public.sits_staff_invitations(email,role,active,issued_by,expires_at)
      values(v_email,v_role,true,_actor,v_expires)
      on conflict(email) do update set role=excluded.role,active=true,issued_by=_actor,
        issued_at=now(),expires_at=v_expires
        where public.sits_staff_invitations.claimed_by is null and public.sits_staff_invitations.role<>'supervisor';
      if not found then raise exception 'forbidden' using errcode='42501'; end if;
    else
      update public.sits_staff_invitations set active=false where email=v_email and active and claimed_by is null;
      if not found then raise exception 'forbidden' using errcode='42501'; end if;
    end if;
  else
    raise exception 'invalid_request' using errcode='22023';
  end if;
  insert into public.sits_audit_events(actor_user_id,event_type,entity_type,entity_id)
  values (_actor,'staff:'||_action,'staff',v_email);
  return jsonb_build_object('email',v_email,'role',v_role,'uid',v_target,'active',v_active,
    'state',case _action when 'staffInvite' then 'pending' when 'staffRevokeInvite' then 'revoked' end,
    'expiresAt',case when _action='staffInvite' then floor(extract(epoch from v_expires)*1000) end);
end;
$$;

revoke all on function public.sits_portal_staff(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.sits_portal_staff(uuid,text,jsonb) to service_role;

-- Public authentication can be configured before the production cutover.
-- Restrict case creation even when an authenticated user calls the RPC directly.
create table sits_private.intake_control (
  singleton boolean primary key default true check(singleton),
  live boolean not null default false,
  test_emails text[] not null
);
revoke all on sits_private.intake_control from public, anon, authenticated;
insert into sits_private.intake_control(test_emails)
values (array['salud@sanpedro-valle.gov.co','adminterritorial@sanpedro-valle.gov.co']);

create function sits_private.guard_pilot_intake()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from sits_private.intake_control c where c.live
      or (new.owner_email=any(c.test_emails) and new.applicant_name='Persona de prueba'
        and new.document_number='TEST001')
  ) then
    raise exception 'pilot_disabled' using errcode='42501';
  end if;
  return new;
end;
$$;

revoke all on function sits_private.guard_pilot_intake() from public, anon, authenticated;
create trigger sits_pilot_intake_guard before insert on public.sits_cases
for each row execute function sits_private.guard_pilot_intake();
