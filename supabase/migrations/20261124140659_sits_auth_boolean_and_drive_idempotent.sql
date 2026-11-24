-- SITS Salud: acceso institucional explícitamente booleano, y reintentos idempotentes
-- de los metadatos de PDFs almacenados exclusivamente en Google Drive.

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
   'canManage',coalesce(v_role in ('admin','supervisor'),false),
   'institutional',v_role is not null);
end;
$$;

create or replace function public.sits_drive_document_saved(
 _case_id uuid,_kind text,_drive_file_id text,_sha256 text,_bytes bigint,
 _filename text,_complete boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_case public.sits_cases%rowtype; v_id uuid; v_version integer;
 v_existing public.sits_case_documents%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role'
  then raise exception 'server_only' using errcode='42501'; end if;

 if _kind not in ('historia','apoyo','certificate')
  or _drive_file_id !~ '^[A-Za-z0-9_-]{10,180}$'
  or _sha256 !~ '^[a-f0-9]{64}$'
  or _bytes<20 or _bytes>4718592
  or length(_filename) not between 1 and 160
  then raise exception 'invalid_document'; end if;

 select * into v_case from public.sits_cases where id=_case_id for update;
 if not found then raise exception 'case_not_found'; end if;

 -- Si Apps Script ya guardó y verificó el mismo PDF, el reintento
 -- confirma el registro existente sin crear una versión duplicada.
 select d.* into v_existing
 from sits_private.drive_objects o
 join public.sits_case_documents d on d.id=o.document_id
 where o.drive_file_id=_drive_file_id
 limit 1;
 if found then
  if v_existing.case_id<>_case_id or v_existing.kind<>_kind
    or v_existing.sha256<>_sha256 or v_existing.bytes<>_bytes
   then raise exception 'drive_file_already_registered'; end if;

  if _complete and v_case.status in ('saving','storage_review') then
   if not exists(select 1 from public.sits_case_documents d
      where d.case_id=_case_id and d.kind='historia')
    then raise exception 'medical_support_required'; end if;
   update public.sits_cases
      set status='received',revision=revision+1,
          last_action='Soportes almacenados en Drive'
    where id=_case_id;
  end if;
  return jsonb_build_object('id',v_existing.id,'caseId',_case_id,
    'version',v_existing.version,
    'status',(select status from public.sits_cases where id=_case_id),
    'alreadySaved',true);
 end if;

 if (_kind='certificate' and v_case.status<>'awaiting_certificate')
   or (_kind in ('historia','apoyo')
       and v_case.status not in ('saving','storage_review','needs_documents'))
  then raise exception 'invalid_document_state'; end if;
 if v_case.status='needs_documents' and _kind<>v_case.correction_kind
  then raise exception 'unexpected_correction_kind'; end if;

 select coalesce(max(version),0)+1 into v_version
 from public.sits_case_documents where case_id=_case_id and kind=_kind;
 v_id:=gen_random_uuid();
 insert into public.sits_case_documents
   (id,case_id,kind,version,storage_bucket,storage_path,
    sha256,bytes,content_type,filename,uploaded_by)
 values
   (v_id,_case_id,_kind,v_version,'google-drive',
    _case_id::text||'/'||v_id::text,_sha256,_bytes,
    'application/pdf',_filename,
    coalesce(v_case.updated_by,v_case.owner_user_id));
 insert into sits_private.drive_objects(document_id,drive_file_id)
 values(v_id,_drive_file_id);

 if _kind='certificate' then
  update public.sits_cases
     set status='sending',revision=revision+1,
         delivery_method=case when certificate_email_consent then 'email' else 'portal' end,
         delivery_status='queued',last_action='Certificado archivado en Drive'
   where id=_case_id;
 elsif v_case.status='needs_documents' then
  update public.sits_cases
     set status='reviewing',revision=revision+1,
         correction_kind=null,last_action='Soporte corregido recibido'
   where id=_case_id;
 elsif _complete then
  if not exists(select 1 from public.sits_case_documents d
      where d.case_id=_case_id and d.kind='historia')
    then raise exception 'medical_support_required'; end if;
  update public.sits_cases
     set status='received',revision=revision+1,
         last_action='Soportes almacenados en Drive'
   where id=_case_id;
 end if;
 insert into public.sits_audit_events(case_id,event_type,entity_type,entity_id)
 values(_case_id,'drive:document_saved','document',v_id::text);
 return jsonb_build_object('id',v_id,'caseId',_case_id,
   'version',v_version,
   'status',(select status from public.sits_cases where id=_case_id),
   'alreadySaved',false);
end;
$$;

-- Mantener funciones privadas exclusivamente para servicio.
revoke all on function public.sits_drive_document_saved(uuid,text,text,text,bigint,text,boolean)
 from public,anon,authenticated;
grant execute on function public.sits_drive_document_saved(uuid,text,text,text,bigint,text,boolean)
 to service_role;
revoke all on function public.sits_session_access() from public,anon;
grant execute on function public.sits_session_access() to authenticated;