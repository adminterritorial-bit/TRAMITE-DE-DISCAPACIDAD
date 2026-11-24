-- Keep the validated official workflow; select required support by immutable service version.
CREATE OR REPLACE FUNCTION public.sits_staff_transition(_case_id uuid, _revision integer, _status text, _comment text DEFAULT ''::text, _document_kind text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 if _status='awaiting_certificate' and (
    v_row.service_id='certificacion-discapacidad'
    or exists(
      select 1 from public.sits_service_versions v,
       lateral jsonb_array_elements(v.form_schema->'fields') f
      where v.service_id=v_row.service_id
       and v.revision=v_row.service_schema_version
       and f->>'type'='document'
       and f->>'fixture'='historia'
       and f->>'required'='true'
    )
  ) and not exists(
    select 1 from public.sits_case_documents
    where case_id=_case_id and kind='historia')
  then raise exception 'support_not_stored'; end if;
 if _status='needs_documents' and v_row.service_id<>'certificacion-discapacidad'
    and not exists(
      select 1 from public.sits_service_versions v,
       lateral jsonb_array_elements(v.form_schema->'fields') f
      where v.service_id=v_row.service_id
       and v.revision=v_row.service_schema_version
       and f->>'type'='document' and f->>'fixture'=_document_kind)
  then raise exception 'invalid_document_kind'; end if;
 update public.sits_cases set status=_status,revision=revision+1,
  last_action=coalesce(_comment,''),updated_by=v_uid,
  correction_kind=case when _status='needs_documents' then _document_kind else null end
 where id=_case_id;
 return jsonb_build_object('id',_case_id,'status',_status,'revision',_revision+1);
end;
$function$
