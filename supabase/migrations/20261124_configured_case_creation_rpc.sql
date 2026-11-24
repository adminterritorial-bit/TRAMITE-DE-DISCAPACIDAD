-- Protected generic case creation. Shares the canonical official case table,
-- idempotency, legal evidence, Drive journal, case events and tracking surface.
-- Absolutely no service is enabled by this migration.
create or replace function public.sits_create_configured_case(_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
 v_uid uuid := (select auth.uid());
 v_email text;
 v_key uuid;
 v_case uuid;
 v_existing boolean := false;
 v_service public.sits_services%rowtype;
 v_fields jsonb;
 v_field jsonb;
 v_answers jsonb;
 v_kinds jsonb;
 v_value jsonb;
 v_id text;
 v_type text;
 v_doc_kind text;
 v_version integer;
 v_required boolean;
 v_count integer;
 v_matched integer;
 v_requires_files boolean := false;
 v_result jsonb;
begin
 if v_uid is null or _payload is null or jsonb_typeof(_payload)<>'object'
    or length(_payload::text)>30000
    or coalesce(auth.jwt()->>'is_anonymous','false')='true'
 then raise exception 'invalid_request'; end if;
 select lower(email) into v_email from auth.users
  where id=v_uid and email_confirmed_at is not null and banned_until is null;
 if v_email is null then raise exception 'email_not_verified' using errcode='28000'; end if;

 if _payload->>'serviceId' !~ '^[a-z][a-z0-9-]{1,39}$'
 then raise exception 'invalid_service'; end if;
 select * into v_service from public.sits_services
  where id=_payload->>'serviceId' and active and intake_enabled;
 if not found then raise exception 'service_not_open'; end if;
 v_version := (v_service.form_schema->>'version')::integer;
 if v_version is null or v_version <= 0
    or (_payload->>'serviceVersion')::integer is distinct from v_version
 then raise exception 'content_version_changed'; end if;
 v_fields := v_service.form_schema->'fields';
 if jsonb_typeof(v_fields)<>'array' or jsonb_array_length(v_fields)>16
 then raise exception 'invalid_service_schema'; end if;
 v_answers := _payload->'answers';
 if jsonb_typeof(v_answers)<>'object' or octet_length(v_answers::text)>16000
 then raise exception 'invalid_request'; end if;
 v_kinds := coalesce(_payload->'documentKinds','[]'::jsonb);
 if jsonb_typeof(v_kinds)<>'array' or jsonb_array_length(v_kinds)>2
 then raise exception 'invalid_document'; end if;
 if exists(select 1 from jsonb_array_elements_text(v_kinds) kind
    where kind not in ('historia','apoyo'))
    or (select count(distinct kind) from jsonb_array_elements_text(v_kinds) kind)
      <> jsonb_array_length(v_kinds)
 then raise exception 'invalid_document'; end if;

 -- Every answer must belong to the immutable published schema.
 if exists(select 1 from jsonb_object_keys(v_answers) key
    where not exists(select 1 from jsonb_array_elements(v_fields) f
      where f->>'id'=key and f->>'type'<>'document'))
 then raise exception 'invalid_profile'; end if;

 for v_field in select value from jsonb_array_elements(v_fields) loop
  v_id := v_field->>'id';
  v_type := v_field->>'type';
  v_required := coalesce((v_field->>'required')::boolean,false);
  if v_field ? 'condition' and
     (v_answers->>(v_field->'condition'->>'field')) is distinct from
       (v_field->'condition'->>'equals') then
    if v_answers ? v_id then raise exception 'invalid_profile'; end if;
    continue;
  end if;
  if v_type='document' then
   v_doc_kind := v_field->>'fixture';
   if v_doc_kind not in ('historia','apoyo') then raise exception 'invalid_service_schema'; end if;
   if v_required and not v_kinds ? v_doc_kind then
    raise exception 'document_required'; end if;
   if v_kinds ? v_doc_kind then v_requires_files := true; end if;
   continue;
  end if;
  v_value := v_answers->v_id;
  if v_value is null or v_value='null'::jsonb or v_value='""'::jsonb then
   if v_required then raise exception 'invalid_profile'; end if;
   continue;
  end if;
  if v_type='checkbox' then
   if jsonb_typeof(v_value)<>'boolean' or (v_required and v_value<>'true'::jsonb)
   then raise exception 'invalid_profile'; end if;
  elsif v_type='number' then
   if jsonb_typeof(v_value) not in ('number','string')
     or v_value #>> '{}' !~ '^-?[0-9]{1,12}([.][0-9]{1,4})?$'
   then raise exception 'invalid_profile'; end if;
  elsif v_type in ('select','radio') then
   if jsonb_typeof(v_value)<>'string' or
    not exists(select 1 from jsonb_array_elements_text(v_field->'options') option
       where option=v_value#>>'{}')
   then raise exception 'invalid_profile'; end if;
  elsif v_type in ('text','textarea','date') then
   if jsonb_typeof(v_value)<>'string' or length(v_value#>>'{}')>
      (case when v_type='textarea' then 2000 else 350 end)
   then raise exception 'invalid_profile'; end if;
   if v_type='date' and v_value#>>'{}' !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
   then raise exception 'invalid_profile'; end if;
  else raise exception 'invalid_service_schema'; end if;
 end loop;
 if v_requires_files and not v_kinds ? 'historia' then
   raise exception 'main_document_required'; end if;

 if (_payload->>'medicalConsent')::boolean is distinct from true
 then raise exception 'legal_decision_required'; end if;
 if jsonb_typeof(_payload->'legalDecisions')<>'array'
 then raise exception 'legal_decision_required'; end if;
 select count(*),count(distinct d.id) into v_count,v_matched
 from jsonb_array_elements(_payload->'legalDecisions') j
 join public.sits_legal_documents d on d.id=j->>'id'
   and d.version=(j->>'version')::integer
   and d.content_hash=j->>'hash'
   and d.active and d.published_at<=now()
   and d.kind in ('processing','privacy','terms','sensitive')
 where j->>'accepted'='true';
 if v_count<>4 or v_matched<>4
   or jsonb_array_length(_payload->'legalDecisions')<>4
 then raise exception 'legal_version_changed'; end if;

 if _payload->>'key' !~ '^[0-9a-fA-F-]{36}$'
 then raise exception 'invalid_request'; end if;
 v_key := (_payload->>'key')::uuid;

 insert into public.sits_cases(
  service_id,service_schema_version,service_answers,
  owner_user_id,owner_email,idempotency_key,applicant_name,
  document_type,document_number,phone,residence_zone,representation,
  support_needed,status,notify_by_email,certificate_email_consent,medical_consent)
 values(
  v_service.id,v_version,v_answers,
  v_uid,v_email,v_key,trim(_payload->>'name'),
  _payload->>'documentType',upper(trim(_payload->>'documentNumber')),
  coalesce(_payload->>'phone',''),_payload->>'zone',_payload->>'representation',
  coalesce(_payload->>'support',''),
  case when v_requires_files then 'saving' else 'received' end,
  coalesce((_payload->>'notifyByEmail')::boolean,false),
  coalesce((_payload->>'certificateEmailConsent')::boolean,false),true)
 on conflict(owner_user_id,idempotency_key) do nothing
 returning id into v_case;
 if v_case is null then
  v_existing := true;
  select id into v_case from public.sits_cases
   where owner_user_id=v_uid and idempotency_key=v_key;
  if (select service_id from public.sits_cases where id=v_case)
      is distinct from v_service.id then
    raise exception 'idempotency_mismatch'; end if;
 end if;
 if v_case is null then raise exception 'case_not_found'; end if;
 if not v_existing then
  insert into public.sits_consent_evidence(
    case_id,owner_user_id,document_id,version,document_hash,accepted)
   select v_case,v_uid,d.id,d.version,d.content_hash,true
   from jsonb_array_elements(_payload->'legalDecisions') j
   join public.sits_legal_documents d on d.id=j->>'id'
     and d.version=(j->>'version')::integer;
  insert into public.sits_case_events(case_id,actor_user_id,action,new_status)
    values(v_case,v_uid,'case_created',
      case when v_requires_files then 'saving' else 'received' end);
  insert into public.sits_audit_events(actor_user_id,case_id,event_type)
    values(v_uid,v_case,'case:created:configured');
 end if;
 select jsonb_build_object('id',id,'reference',reference,'status',status,
   'revision',revision,'createdAt',created_at,'serviceId',service_id)
 into v_result from public.sits_cases where id=v_case;
 return v_result;
end;
$$;

revoke all on function public.sits_create_configured_case(jsonb) from public,anon;
grant execute on function public.sits_create_configured_case(jsonb) to authenticated;
