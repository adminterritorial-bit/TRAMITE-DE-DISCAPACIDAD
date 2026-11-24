-- Legal review of the consent scope is independent of form publication.
-- Current public legal notices were written for disability certification.
-- A generic service cannot be enabled until Salud approves its own legal basis.
alter table public.sits_services
 add column if not exists intake_legal_approved boolean not null default false;
do $safe$
begin
 if not exists (
  select 1 from pg_constraint
  where conrelid='public.sits_services'::regclass
  and conname='sits_configured_intake_legal_guard'
 ) then
  alter table public.sits_services
   add constraint sits_configured_intake_legal_guard
   check (not intake_enabled or intake_legal_approved);
 end if;
end $safe$;
comment on column public.sits_services.intake_legal_approved is
 'Requires Salud legal/privacy approval of service-specific consent and document purposes before configurable public intake.';
