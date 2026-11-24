CREATE OR REPLACE FUNCTION public.sits_case_workspace(_staff boolean DEFAULT false, _filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_search text := lower(trim(coalesce(_filters->>'search','')));
  v_status text := nullif(_filters->>'status','');
  v_service text := nullif(_filters->>'serviceId','');
  v_owner text := coalesce(_filters->>'owner','');
  v_task text := coalesce(_filters->>'task','');
  v_order text := coalesce(_filters->>'sort','new');
  v_page int := greatest(1,least(400,coalesce((_filters->>'page')::int,1)));
  v_size int := greatest(1,least(25,coalesce((_filters->>'size')::int,15)));
  v_from timestamptz := nullif(_filters->>'from','')::date::timestamp at time zone 'America/Bogota';
  v_to timestamptz := (nullif(_filters->>'to','')::date+1)::timestamp at time zone 'America/Bogota';
  result jsonb;
begin
  if v_uid is null or coalesce((select auth.jwt()->>'is_anonymous'),'false')='true' then
    raise exception 'not_authenticated' using errcode='42501';
  end if;
  if coalesce(_staff,false) and not (select sits_private.is_case_officer()) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if length(v_search)>100 or (v_service is not null and v_service !~ '^[a-z][a-z0-9-]{1,79}$')
     or v_order not in ('new','old','activity') or v_owner not in ('','me','none')
     or v_task not in ('','pending') or (v_from is not null and v_to is not null and v_from>=v_to) then
    raise exception 'invalid_request' using errcode='22023';
  end if;
  with filtered as (
    select c.id,c.reference,c.service_id,c.status,c.created_at,c.updated_at,c.delivery_method,
      case when _staff then c.applicant_name else null end as applicant_name,
      case when _staff then c.assigned_to else null end as assigned_to,
      count(*) over() as matches
    from public.sits_cases c
    where (coalesce(_staff,false) or c.owner_user_id=v_uid)
      and (v_status is null or c.status=v_status)
      and (v_service is null or c.service_id=v_service)
      and (v_from is null or c.created_at>=v_from)
      and (v_to is null or c.created_at<v_to)
      and (not _staff or v_owner='' or (v_owner='me' and c.assigned_to=v_uid) or (v_owner='none' and c.assigned_to is null))
      and (not _staff or v_task='' or c.status in ('received','needs_documents','awaiting_certificate','delivery_review'))
      and (v_search='' or strpos(lower(c.reference),v_search)>0 or (_staff and
        (strpos(lower(c.applicant_name),v_search)>0 or strpos(lower(c.document_number),v_search)>0)))
  ), page as (
    select f.*,row_number() over(
      order by case when v_order='activity' then f.updated_at end desc,
        case when v_order='old' then f.created_at end asc,
        f.created_at desc,f.id desc
    ) as position
    from filtered f
    order by position
    offset ((v_page-1)*v_size) limit v_size
  )
  select jsonb_build_object(
    'items',coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id',p.id,'reference',p.reference,'serviceId',p.service_id,'status',p.status,'createdAt',p.created_at,'updatedAt',p.updated_at,
        'name',p.applicant_name,'assignedTo',p.assigned_to,'deliveryMethod',p.delivery_method,
        'certificateAvailable',p.status in ('available','delivered','delivery_review','closed') and
          exists(select 1 from public.sits_case_documents d where d.case_id=p.id and d.kind='certificate')
      )) order by p.position) from page p
    ),'[]'::jsonb),
    'total',coalesce((select max(matches) from page),(select count(*) from filtered)),
    'metrics',case when _staff then coalesce((
      select jsonb_object_agg(status,count) from (
        select c.status,count(*) from public.sits_cases c where (v_service is null or c.service_id=v_service) group by c.status
      ) counts
    ),'{}'::jsonb) else null end,
    'activity',case when _staff then coalesce((
      select jsonb_agg(jsonb_build_object('reference',a.reference,'status',a.status,'updatedAt',a.updated_at)
        order by a.updated_at desc,a.id desc)
      from (select id,reference,status,updated_at from public.sits_cases order by updated_at desc,id desc limit 4) a
    ),'[]'::jsonb) else null end
  ) into result;
  return result;
end
$function$
