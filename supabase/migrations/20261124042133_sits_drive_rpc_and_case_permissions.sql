-- SITS Salud · Supabase relational backend / Google Drive custody
-- Migration is additive. No Firestore, Apps Script, existing Drive files or production credentials are removed.
-- Every direct write to clinical tables remains denied for anon/authenticated users.

alter table public.sits_case_documents alter column storage_bucket set default 'google-drive';
alter table public.sits_case_documents drop constraint sits_case_documents_storage_bucket_check;
alter table public.sits_case_documents
  add constraint sits_case_documents_storage_bucket_check check (storage_bucket = 'google-drive');

-- Never expose the real Drive file IDs through the public Data API.
create table if not exists sits_private.drive_objects (
  document_id uuid primary key references public.sits_case_documents(id) on delete restrict,
  drive_file_id text not null unique check (drive_file_id ~ '^[A-Za-z0-9_-]{10,180}$'),
  created_at timestamptz not null default now()
);
alter table sits_private.drive_objects enable row level security;
revoke all on sits_private.drive_objects from public, anon, authenticated;

-- Only Salud case officers, not unrelated operators, can see private dossiers.
create or replace function sits_private.is_case_officer()
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists(
  select 1 from public.sits_staff_members s
  where s.user_id = (select auth.uid()) and s.active = true
   and s.role in ('admin','supervisor')
 );
$$;
revoke all on function sits_private.is_case_officer() from public;
grant execute on function sits_private.is_case_officer() to authenticated;

drop policy if exists cases_owner_or_staff on public.sits_cases;
create policy cases_owner_or_officer on public.sits_cases for select to authenticated
 using(owner_user_id = (select auth.uid()) or (select sits_private.is_case_officer()));

drop policy if exists documents_owner_released_or_staff on public.sits_case_documents;
create policy documents_owner_released_or_officer on public.sits_case_documents for select to authenticated
 using((select sits_private.is_case_officer()) or exists(
  select 1 from public.sits_cases c
   where c.id = case_id and c.owner_user_id = (select auth.uid())
     and (kind <> 'certificate' or c.status in ('available','delivered','delivery_review','closed'))
 ));

drop policy if exists case_events_owner_or_staff on public.sits_case_events;
create policy case_events_owner_or_officer on public.sits_case_events for select to authenticated
 using(exists(select 1 from public.sits_cases c
  where c.id=case_id and (c.owner_user_id=(select auth.uid()) or (select sits_private.is_case_officer()))));

drop policy if exists consent_owner_or_staff on public.sits_consent_evidence;
create policy consent_owner_or_officer on public.sits_consent_evidence for select to authenticated
 using(owner_user_id=(select auth.uid()) or (select sits_private.is_case_officer()));

drop policy if exists delivery_staff_only on public.sits_delivery_attempts;
create policy delivery_officer_only on public.sits_delivery_attempts for select to authenticated
 using((select sits_private.is_case_officer()));

drop policy if exists notifications_own_or_staff on public.sits_notifications;
create policy notifications_own_or_officer on public.sits_notifications for select to authenticated
 using(recipient_user_id=(select auth.uid()) or (select sits_private.is_case_officer()));

drop policy if exists rights_owner_or_staff on public.sits_rights_requests;
create policy rights_owner_or_officer on public.sits_rights_requests for select to authenticated
 using(requester_user_id=(select auth.uid()) or (select sits_private.is_case_officer()));

drop policy if exists audit_staff on public.sits_audit_events;
create policy audit_officer_only on public.sits_audit_events for select to authenticated
 using((select sits_private.is_case_officer()));

-- Access decisions rely only on verified server-side identity, never user_metadata.
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
   and v_email like '%@sanpedro-valle.gov.co';
 return jsonb_build_object('userId',v_uid,'email',v_email,'role',v_role,
   'canManage',v_role in ('admin','supervisor'),'institutional',v_role is not null);
end;
$$;

create or replace function public.sits_register_citizen(_name text default null, _phone text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_email text;
begin
 if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
 select lower(email) into v_email from auth.users
  where id=v_uid and email_confirmed_at is not null and banned_until is null;
 if v_email is null then raise exception 'email_not_verified' using errcode='28000'; end if;
 if length(coalesce(_name,''))>120 or length(coalesce(_phone,''))>25
  then raise exception 'invalid_profile'; end if;
 insert into public.sits_citizen_profiles(user_id,display_name,contact_phone)
 values(v_uid,nullif(trim(_name),''),nullif(trim(_phone),''))
 on conflict(user_id) do update set
  display_name=coalesce(excluded.display_name,public.sits_citizen_profiles.display_name),
  contact_phone=coalesce(excluded.contact_phone,public.sits_citizen_profiles.contact_phone),
  updated_at=now();
 return jsonb_build_object('userId',v_uid,'email',v_email);
end;
$$;

-- An invitation grants staff rights only after a real Google identity signs in.
create or replace function public.sits_claim_staff_invitation()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_email text; v_inv public.sits_staff_invitations%rowtype;
begin
 if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
 select lower(email) into v_email from auth.users
  where id=v_uid and email_confirmed_at is not null and banned_until is null;
 if v_email is null or v_email not like '%@sanpedro-valle.gov.co'
  then raise exception 'forbidden' using errcode='42501'; end if;
 if not exists(select 1 from auth.identities i where i.user_id=v_uid
   and i.provider='google' and lower(i.identity_data->>'email')=v_email)
  then raise exception 'google_identity_required' using errcode='42501'; end if;
 select * into v_inv from public.sits_staff_invitations
  where email=v_email and active=true for update;
 if not found then raise exception 'invitation_required' using errcode='42501'; end if;
 if v_inv.claimed_by is not null and v_inv.claimed_by<>v_uid
  then raise exception 'invitation_already_claimed' using errcode='42501'; end if;
 insert into public.sits_staff_members(user_id,institutional_email,role,active)
 values(v_uid,v_email,v_inv.role,true)
 on conflict(user_id) do update set
  active=true,role=excluded.role,updated_at=now()
  where public.sits_staff_members.institutional_email=v_email;
 update public.sits_staff_invitations set claimed_by=v_uid,claimed_at=coalesce(claimed_at,now())
  where email=v_email;
 insert into public.sits_audit_events(actor_user_id,event_type,entity_type,entity_id)
 values(v_uid,'staff:invitation_claimed','staff',v_uid::text);
 return public.sits_session_access();
end;
$$;

create or replace function public.sits_issue_staff_invitation(_email text,_role public.sits_staff_role)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid()); v_email text := lower(trim(_email));
begin
 if v_actor is null or not (select sits_private.is_supervisor())
  then raise exception 'forbidden' using errcode='42501'; end if;
 if v_email !~ '^[a-z0-9._%+-]+@sanpedro-valle[.]gov[.]co$'
  then raise exception 'institutional_email_required'; end if;
 if _role not in ('operator','admin','supervisor')
  then raise exception 'invalid_role'; end if;
 insert into public.sits_staff_invitations(email,role,active,issued_by)
 values(v_email,_role,true,v_actor)
 on conflict(email) do update set role=excluded.role,active=true,
  issued_by=v_actor,issued_at=now(),claimed_by=null,claimed_at=null;
 insert into public.sits_audit_events(actor_user_id,event_type,entity_type,entity_id)
 values(v_actor,'staff:invitation_issued','staff',v_email);
end;
$$;

-- Atomically create a request and record all four legal decisions. No PDFs are sent to Postgres.
create or replace function public.sits_create_case(_payload jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_email text; v_key uuid; v_case uuid;
 v_matched int; v_count int; v_existing boolean := false; v_record jsonb;
begin
 if v_uid is null or _payload is null or jsonb_typeof(_payload)<>'object'
  or length(_payload::text)>30000 or coalesce(auth.jwt()->>'is_anonymous','false')='true'
  then raise exception 'invalid_request'; end if;
 select lower(email) into v_email from auth.users
 where id=v_uid and email_confirmed_at is not null and banned_until is null;
 if v_email is null then raise exception 'email_not_verified' using errcode='28000'; end if;
 if (_payload->>'medicalConsent')::boolean is distinct from true
  then raise exception 'legal_decision_required'; end if;
 if jsonb_typeof(_payload->'legalDecisions')<>'array'
  then raise exception 'legal_decision_required'; end if;
 select count(*),count(distinct d.id) into v_count,v_matched
 from jsonb_array_elements(_payload->'legalDecisions') j
 join public.sits_legal_documents d on d.id=j->>'id'
   and d.version=(j->>'version')::integer
   and d.content_hash=j->>'hash' and d.active=true and d.published_at<=now()
   and d.kind in ('processing','privacy','terms','sensitive')
 where j->>'accepted'='true';
 if v_count<>4 or v_matched<>4 or jsonb_array_length(_payload->'legalDecisions')<>4
  then raise exception 'legal_version_changed'; end if;
 v_key := (_payload->>'key')::uuid;
 if v_key is null then raise exception 'invalid_request'; end if;
 insert into public.sits_cases(
   service_id,owner_user_id,owner_email,idempotency_key,applicant_name,
   document_type,document_number,phone,residence_zone,representation,support_needed,
   status,notify_by_email,certificate_email_consent,medical_consent)
 values(
  'certificacion-discapacidad',v_uid,v_email,v_key,
  trim(_payload->>'name'),_payload->>'documentType',upper(trim(_payload->>'documentNumber')),
  coalesce(_payload->>'phone',''),_payload->>'zone',_payload->>'representation',
  coalesce(_payload->>'support',''),'saving',
  coalesce((_payload->>'notifyByEmail')::boolean,false),
  coalesce((_payload->>'certificateEmailConsent')::boolean,false),true)
 on conflict(owner_user_id,idempotency_key) do nothing returning id into v_case;
 if v_case is null then
  v_existing:=true;
  select id into v_case from public.sits_cases
    where owner_user_id=v_uid and idempotency_key=v_key;
 end if;
 if v_case is null then raise exception 'case_not_found'; end if;
 if not v_existing then
  insert into public.sits_consent_evidence(case_id,owner_user_id,document_id,version,document_hash,accepted)
   select v_case,v_uid,d.id,d.version,d.content_hash,true
   from jsonb_array_elements(_payload->'legalDecisions') j
   join public.sits_legal_documents d on d.id=j->>'id' and d.version=(j->>'version')::integer;
  insert into public.sits_case_events(case_id,actor_user_id,action,new_status)
   values(v_case,v_uid,'case_created','saving');
  insert into public.sits_audit_events(actor_user_id,case_id,event_type)
   values(v_uid,v_case,'case:created');
 end if;
 select jsonb_build_object('id',id,'reference',reference,'status',status,
   'revision',revision,'createdAt',created_at) into v_record
 from public.sits_cases where id=v_case;
 return v_record;
end;
$$;

-- Client cannot issue transitions for delivery; that belongs to the Drive+Mail server.
create or replace function public.sits_staff_transition(
 _case_id uuid,_revision int,_status text,_comment text default '',_document_kind text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := (select auth.uid()); v_row public.sits_cases%rowtype;
begin
 if v_uid is null or not (select sits_private.is_case_officer())
  then raise exception 'forbidden' using errcode='42501'; end if;
 if length(coalesce(_comment,''))>450 then raise exception 'invalid_comment'; end if;
 if _status not in ('reviewing','needs_documents','awaiting_certificate','not_proceed','closed')
  then raise exception 'invalid_transition'; end if;
 if _status='needs_documents' and _document_kind not in ('historia','apoyo')
  then raise exception 'invalid_document_kind'; end if;
 select * into v_row from public.sits_cases where id=_case_id for update;
 if not found or v_row.revision<>_revision then raise exception 'revision_conflict'; end if;
 if not ((v_row.status='received' and _status='reviewing')
  or (v_row.status='reviewing' and _status in ('needs_documents','awaiting_certificate','not_proceed'))
  or (v_row.status='needs_documents' and _status='reviewing')
  or (v_row.status='awaiting_certificate' and _status in ('reviewing','not_proceed'))
  or (v_row.status in ('delivered','available','not_proceed') and _status='closed'))
  then raise exception 'invalid_transition'; end if;
 if _status='awaiting_certificate' and not exists(
  select 1 from public.sits_case_documents where case_id=_case_id and kind='historia')
  then raise exception 'support_not_stored'; end if;
 update public.sits_cases set status=_status,revision=revision+1,
  last_action=coalesce(_comment,''),updated_by=v_uid,
  correction_kind=case when _status='needs_documents' then _document_kind else null end
 where id=_case_id;
 return jsonb_build_object('id',_case_id,'status',_status,'revision',_revision+1);
end;
$$;

-- The next RPCs are server-only. Invoke them AFTER Apps Script has verified the user's
-- token and written/checked the real PDF inside the existing restricted Drive folder.
create or replace function public.sits_drive_document_saved(
 _case_id uuid,_kind text,_drive_file_id text,_sha256 text,_bytes bigint,
 _filename text,_complete boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_case public.sits_cases%rowtype; v_id uuid; v_version int;
 v_existing uuid;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role'
  then raise exception 'server_only' using errcode='42501'; end if;
 if _kind not in ('historia','apoyo','certificate')
  or _drive_file_id !~ '^[A-Za-z0-9_-]{10,180}$'
  or _sha256 !~ '^[a-f0-9]{64}$'
  or _bytes<20 or _bytes>4718592 or length(_filename) not between 1 and 160
  then raise exception 'invalid_document'; end if;
 select * into v_case from public.sits_cases where id=_case_id for update;
 if not found then raise exception 'case_not_found'; end if;
 if _kind='certificate' and v_case.status<>'awaiting_certificate'
   or _kind='historia' and v_case.status not in ('saving','storage_review','needs_documents')
   or _kind='apoyo' and v_case.status not in ('saving','storage_review','needs_documents')
  then raise exception 'invalid_document_state'; end if;
 if v_case.status='needs_documents' and _kind<>v_case.correction_kind
  then raise exception 'unexpected_correction_kind'; end if;
 if exists(select 1 from sits_private.drive_objects where drive_file_id=_drive_file_id)
  then raise exception 'drive_file_already_registered'; end if;
 select coalesce(max(version),0)+1 into v_version from public.sits_case_documents
  where case_id=_case_id and kind=_kind;
 v_id:=gen_random_uuid();
 insert into public.sits_case_documents(
  id,case_id,kind,version,storage_bucket,storage_path,sha256,bytes,content_type,filename,uploaded_by)
 values(v_id,_case_id,_kind,v_version,'google-drive',_case_id::text||'/'||v_id::text,
  _sha256,_bytes,'application/pdf',_filename,
  coalesce(v_case.updated_by,v_case.owner_user_id));
 insert into sits_private.drive_objects(document_id,drive_file_id) values(v_id,_drive_file_id);
 if _kind='certificate' then
  update public.sits_cases set status='sending',revision=revision+1,
   delivery_method=case when certificate_email_consent then 'email' else 'portal' end,
   delivery_status='queued',last_action='Certificado archivado en Drive'
   where id=_case_id;
 elsif v_case.status='needs_documents' then
  update public.sits_cases set status='reviewing',revision=revision+1,
   correction_kind=null,last_action='Soporte corregido recibido'
   where id=_case_id;
 elsif _complete then
  if not exists(select 1 from public.sits_case_documents
     where case_id=_case_id and kind='historia')
   then raise exception 'medical_support_required'; end if;
  update public.sits_cases set status='received',revision=revision+1,
   last_action='Soportes almacenados en Drive'
   where id=_case_id;
 end if;
 insert into public.sits_audit_events(case_id,event_type,entity_type,entity_id)
  values(_case_id,'drive:document_saved','document',v_id::text);
 return jsonb_build_object('id',v_id,'caseId',_case_id,'version',v_version,
  'status',(select status from public.sits_cases where id=_case_id));
end;
$$;

create or replace function public.sits_drive_document_reference(_document_id uuid)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare v_file text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role'
  then raise exception 'server_only' using errcode='42501'; end if;
 select drive_file_id into v_file from sits_private.drive_objects where document_id=_document_id;
 if v_file is null then raise exception 'document_not_found'; end if;
 return v_file;
end;
$$;

create or replace function public.sits_drive_delivery_result(
 _case_id uuid,_result text,_provider_message_id text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_case public.sits_cases%rowtype; v_next text; v_method text;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role'
  then raise exception 'server_only' using errcode='42501'; end if;
 if _result not in ('confirmed','uncertain')
  then raise exception 'invalid_delivery_result'; end if;
 select * into v_case from public.sits_cases where id=_case_id for update;
 if not found or v_case.status not in ('sending','delivery_review')
  then raise exception 'invalid_transition'; end if;
 v_method:=v_case.delivery_method;
 if v_method not in ('email','portal') then raise exception 'invalid_delivery_method'; end if;
 v_next:=case when _result='uncertain' then 'delivery_review'
   when v_method='email' then 'delivered' else 'available' end;
 if v_case.status='delivery_review' and v_next='delivery_review'
  then raise exception 'invalid_transition'; end if;
 insert into public.sits_delivery_attempts(case_id,document_id,method,recipient_email,
  status,provider_message_id,attempt_count,resolved_at)
 values(_case_id,
  (select id from public.sits_case_documents where case_id=_case_id and kind='certificate'
    order by version desc limit 1),v_method,
  case when v_method='email' then v_case.owner_email else null end,
  _result,_provider_message_id,1,case when _result='confirmed' then now() else null end);
 update public.sits_cases set status=v_next,revision=revision+1,
  delivery_status=case when _result='confirmed' then 'confirmed' else 'uncertain' end,
  last_action=case when _result='confirmed' then 'Entrega comprobada' else 'Entrega por verificar' end
 where id=_case_id;
 return jsonb_build_object('id',_case_id,'status',v_next,'revision',v_case.revision+1);
end;
$$;

-- Limit the public RPC surface explicitly; Postgres grants execute to PUBLIC by default.
revoke all on function public.sits_session_access() from public,anon;
revoke all on function public.sits_register_citizen(text,text) from public,anon;
revoke all on function public.sits_claim_staff_invitation() from public,anon;
revoke all on function public.sits_issue_staff_invitation(text,public.sits_staff_role) from public,anon;
revoke all on function public.sits_create_case(jsonb) from public,anon;
revoke all on function public.sits_staff_transition(uuid,integer,text,text,text) from public,anon;
revoke all on function public.sits_drive_document_saved(uuid,text,text,text,bigint,text,boolean) from public,anon,authenticated;
revoke all on function public.sits_drive_document_reference(uuid) from public,anon,authenticated;
revoke all on function public.sits_drive_delivery_result(uuid,text,text) from public,anon,authenticated;

grant execute on function public.sits_session_access() to authenticated;
grant execute on function public.sits_register_citizen(text,text) to authenticated;
grant execute on function public.sits_claim_staff_invitation() to authenticated;
grant execute on function public.sits_issue_staff_invitation(text,public.sits_staff_role) to authenticated;
grant execute on function public.sits_create_case(jsonb) to authenticated;
grant execute on function public.sits_staff_transition(uuid,integer,text,text,text) to authenticated;
grant execute on function public.sits_drive_document_saved(uuid,text,text,text,bigint,text,boolean) to service_role;
grant execute on function public.sits_drive_document_reference(uuid) to service_role;
grant execute on function public.sits_drive_delivery_result(uuid,text,text) to service_role;
