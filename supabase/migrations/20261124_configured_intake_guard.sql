-- Adds a guarded, versionable citizen workflow for configured services.
-- Dormant by default; no service can accept public intake until approved and
-- connected to the production Drive/consent/notification path.
alter table public.sits_services
 add column if not exists intake_enabled boolean not null default false,
 add column if not exists intake_approval_reference text,
 add column if not exists intake_approved_at timestamptz;

alter table public.sits_cases
 add column if not exists service_schema_version integer,
 add column if not exists service_answers jsonb not null default '{}'::jsonb;

do $safe$
begin
 if not exists(select 1 from pg_constraint where conname='sits_services_intake_approval_guard'
   and conrelid='public.sits_services'::regclass) then
  alter table public.sits_services add constraint sits_services_intake_approval_guard
  check (not intake_enabled or (active and
         length(trim(coalesce(intake_approval_reference,''))) between 8 and 200
         and intake_approved_at is not null));
 end if;
 if not exists(select 1 from pg_constraint where conname='sits_cases_service_answers_size'
   and conrelid='public.sits_cases'::regclass) then
  alter table public.sits_cases add constraint sits_cases_service_answers_size
  check (jsonb_typeof(service_answers)='object'
    and octet_length(service_answers::text)<=16000);
 end if;
end $safe$;

comment on column public.sits_services.intake_enabled is
 'False until production E2E approval for the configurable service. Does not govern the existing disability certification.';
comment on column public.sits_cases.service_answers is
 'Validated additional service fields. Do not include binary clinical documents or raw file URLs.';
