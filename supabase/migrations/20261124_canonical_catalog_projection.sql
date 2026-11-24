-- SITS Salud | Single authoritative source for configurable catalogue.
-- The versioned catalog/registry remains the write model; relational tables are
-- a transactionally maintained, queryable projection. No data is deleted.
create or replace function sits_private.sync_service_catalog_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  live_schema jsonb;
  draft_schema jsonb;
  effective_schema jsonb;
  service_code text;
  revision_number integer;
  live_version integer;
  has_live boolean;
begin
  if new.collection <> 'catalog' or new.record_id <> 'registry' then
    return new;
  end if;
  if jsonb_typeof(new.data -> 'categories') is distinct from 'array'
    or jsonb_typeof(new.data -> 'services') is distinct from 'array' then
    raise exception 'invalid_catalog_registry' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(new.data -> 'categories')
  loop
    insert into public.sits_service_categories (id, title, active)
    values (item ->> 'id', item ->> 'title', coalesce((item ->> 'active')::boolean, false))
    on conflict (id) do update
      set title = excluded.title, active = excluded.active;
  end loop;

  for item in select value from jsonb_array_elements(new.data -> 'services')
  loop
    service_code := item ->> 'id';
    draft_schema := coalesce(item -> 'draft', '{}'::jsonb);
    live_schema := item -> 'live';
    has_live := coalesce(jsonb_typeof(live_schema) = 'object', false);
    effective_schema := case when has_live then live_schema else draft_schema end;
    revision_number := greatest(coalesce((item ->> 'revision')::integer,1),1);
    insert into public.sits_services (
      id, category_id, title, description, active, revision, form_schema, flow_schema, published_at)
    values (
      service_code, effective_schema ->> 'category', effective_schema ->> 'title',
      coalesce(effective_schema ->> 'description',''), has_live,
      revision_number, effective_schema,
      jsonb_build_object('states',coalesce(effective_schema->'states','[]'::jsonb),
                         'operators',coalesce(effective_schema->'operators','[]'::jsonb)),
      case when has_live then now() else null end)
    on conflict(id) do update set
      category_id = excluded.category_id,
      title = excluded.title,
      description = excluded.description,
      active = excluded.active,
      revision = greatest(public.sits_services.revision,excluded.revision),
      form_schema = excluded.form_schema,
      flow_schema = excluded.flow_schema,
      published_at = case when excluded.active
        then coalesce(public.sits_services.published_at, excluded.published_at)
        else public.sits_services.published_at end,
      updated_at = now();

    if has_live then
      live_version := (live_schema ->> 'version')::integer;
      if live_version is null or live_version <= 0 then
        raise exception 'invalid_catalog_version' using errcode = '22023';
      end if;
      insert into public.sits_service_versions (
        service_id, revision, form_schema, flow_schema, published_by)
      values (
        service_code,live_version,live_schema,
        jsonb_build_object('states',coalesce(live_schema->'states','[]'::jsonb),
                           'operators',coalesce(live_schema->'operators','[]'::jsonb)),
        null)
      on conflict(service_id,revision) do nothing;
    end if;
  end loop;
  return new;
end
$$;

revoke all on function sits_private.sync_service_catalog_projection() from public, anon, authenticated;

drop trigger if exists sits_sync_service_catalog_projection
  on public.sits_portal_records;
create trigger sits_sync_service_catalog_projection
after insert or update of data on public.sits_portal_records
for each row
when (new.collection = 'catalog' and new.record_id = 'registry')
execute function sits_private.sync_service_catalog_projection();

-- Project existing 13 named categories and any existing configurable services.
update public.sits_portal_records
   set data = data
 where collection = 'catalog' and record_id = 'registry';

-- One official service, one municipal health category. Keep case/ownership IDs.
update public.sits_services
   set category_id = 'discapacidad-apoyos', updated_at = now()
 where id = 'certificacion-discapacidad'
   and category_id <> 'discapacidad-apoyos'
   and exists (select 1 from public.sits_service_categories
               where id = 'discapacidad-apoyos' and active);
