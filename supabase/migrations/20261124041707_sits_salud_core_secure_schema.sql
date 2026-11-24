
-- SITS Salud / San Pedro: fresh, pilot-only Supabase foundation.
-- No clinical, citizen or previous Firestore data is migrated by this migration.
create schema if not exists sits_private;
revoke all on schema sits_private from public, anon, authenticated;

create type public.sits_staff_role as enum ('operator','admin','supervisor');
create sequence public.sits_case_number_seq;

create table public.sits_staff_members (
  user_id uuid primary key references auth.users(id) on delete restrict,
  institutional_email text not null unique check (institutional_email = lower(institutional_email)),
  role public.sits_staff_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.sits_citizen_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (length(display_name) <= 120),
  contact_phone text check (length(contact_phone) <= 25),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.sits_service_categories (
  id text primary key check(id ~ '^[a-z][a-z0-9-]{1,39}$'),
  title text not null check(length(title) between 3 and 100),
  active boolean not null default true,
  sort_order integer not null default 0
);
create table public.sits_services (
  id text primary key check(id ~ '^[a-z][a-z0-9-]{1,79}$'),
  category_id text not null references public.sits_service_categories(id),
  title text not null check(length(title) between 3 and 160),
  description text not null default '',
  active boolean not null default false,
  revision integer not null default 1 check(revision>0),
  form_schema jsonb not null default '{}'::jsonb,
  flow_schema jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
create table public.sits_service_versions (
  id uuid primary key default gen_random_uuid(),
  service_id text not null references public.sits_services(id),
  revision integer not null check(revision>0),
  form_schema jsonb not null,
  flow_schema jsonb not null,
  published_by uuid references auth.users(id),
  published_at timestamptz not null default now(),
  unique(service_id,revision)
);
create table public.sits_legal_documents (
  id text not null,
  version integer not null check(version>0),
  kind text not null check(kind in ('processing','privacy','terms','sensitive','other')),
  title text not null,
  body text not null,
  content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
  published_at timestamptz not null default now(),
  active boolean not null default true,
  primary key(id,version)
);
create unique index sits_legal_one_active on public.sits_legal_documents(id) where active;
create table public.sits_cases (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  service_id text not null references public.sits_services(id),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  owner_email text not null,
  idempotency_key uuid not null,
  applicant_name text not null check(length(applicant_name) between 2 and 120),
  document_type text not null check(document_type in ('CC','TI','RC','CE','PA','OTRO')),
  document_number text not null check(document_number ~ '^[A-Z0-9-]{3,25}$'),
  phone text not null default '' check(length(phone)<=25),
  residence_zone text not null check(residence_zone in ('Cabecera municipal','Centro poblado','Zona rural dispersa')),
  representation text not null check(representation in ('propia','apoyo')),
  support_needed text not null default '' check(length(support_needed)<=300),
  status text not null default 'saving' check(status in ('saving','storage_review','received','reviewing','needs_documents','awaiting_certificate','not_proceed','sending','delivery_review','delivered','available','closed')),
  revision integer not null default 1 check(revision>0),
  correction_kind text check(correction_kind in ('historia','apoyo')),
  notify_by_email boolean not null default false,
  certificate_email_consent boolean not null default false,
  medical_consent boolean not null default false,
  delivery_method text check(delivery_method in ('email','portal')),
  delivery_status text check(delivery_status in ('queued','confirmed','uncertain','not_configured','failed')),
  assigned_to uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  last_action text check(length(last_action)<=450),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  unique(owner_user_id,idempotency_key)
);
create index sits_cases_owner_created on public.sits_cases(owner_user_id,created_at desc);
create index sits_cases_status_created on public.sits_cases(status,created_at desc);
create index sits_cases_service_status on public.sits_cases(service_id,status);
create index sits_cases_assigned on public.sits_cases(assigned_to) where assigned_to is not null;

create table public.sits_case_documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.sits_cases(id) on delete restrict,
  kind text not null check(kind in ('historia','apoyo','certificate','other')),
  version integer not null default 1 check(version>0),
  storage_bucket text not null default 'sits-salud-private' check(storage_bucket='sits-salud-private'),
  storage_path text not null unique,
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  bytes bigint not null check(bytes between 20 and 4718592),
  content_type text not null default 'application/pdf' check(content_type='application/pdf'),
  filename text not null check(length(filename) between 1 and 160),
  uploaded_by uuid not null references auth.users(id),
  uploaded_at timestamptz not null default now(),
  unique(case_id,kind,version),
  check (storage_path like case_id::text || '/%')
);
create index sits_documents_case on public.sits_case_documents(case_id,kind,version desc);

create table public.sits_case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.sits_cases(id) on delete restrict,
  actor_user_id uuid references auth.users(id),
  action text not null,
  old_status text,
  new_status text,
  comment text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index sits_case_events_case_time on public.sits_case_events(case_id,created_at desc);

create table public.sits_consent_evidence (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.sits_cases(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id),
  document_id text not null,
  version integer not null,
  document_hash text not null check(document_hash ~ '^[a-f0-9]{64}$'),
  accepted boolean not null check(accepted=true),
  purpose text not null default 'certificacion_discapacidad',
  accepted_at timestamptz not null default now(),
  unique(case_id,document_id),
  foreign key(document_id,version) references public.sits_legal_documents(id,version)
);

create table public.sits_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.sits_cases(id) on delete restrict,
  document_id uuid references public.sits_case_documents(id),
  method text not null check(method in ('email','portal')),
  recipient_email text,
  status text not null check(status in ('queued','sending','confirmed','uncertain','failed','not_configured')),
  provider_message_id text,
  attempt_count integer not null default 0 check(attempt_count >= 0),
  last_error_code text,
  requested_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index sits_delivery_case on public.sits_delivery_attempts(case_id,created_at desc);
create unique index sits_delivery_unique_confirmed on public.sits_delivery_attempts(case_id,document_id,method) where status='confirmed';

create table public.sits_notifications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.sits_cases(id),
  recipient_user_id uuid references auth.users(id),
  recipient_email text,
  kind text not null,
  state text not null default 'queued' check(state in ('queued','sending','confirmed','failed','uncertain','not_configured')),
  attempts integer not null default 0 check(attempts >= 0),
  provider_message_id text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index sits_notifications_pending on public.sits_notifications(state,created_at) where state in ('queued','failed');

create table public.sits_staff_invitations (
  email text primary key check(email=lower(email)),
  role public.sits_staff_role not null,
  active boolean not null default true,
  issued_by uuid references auth.users(id),
  issued_at timestamptz not null default now(),
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz
);

create table public.sits_public_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience text not null default 'all' check(audience in ('all','citizen','staff')),
  published_at timestamptz,
  expires_at timestamptz,
  active boolean not null default true
);
create index sits_notices_published on public.sits_public_notices(published_at desc) where active=true;

create table public.sits_rights_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id),
  case_id uuid references public.sits_cases(id),
  kind text not null check(kind in ('access','correction','update','deletion','other')),
  description text not null check(length(description) between 10 and 4000),
  status text not null default 'received' check(status in ('received','reviewing','answered','closed')),
  response text,
  assigned_to uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sits_rights_owner on public.sits_rights_requests(requester_user_id,created_at desc);

create table public.sits_audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id),
  case_id uuid references public.sits_cases(id) on delete restrict,
  event_type text not null,
  entity_type text not null default 'case',
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index sits_audit_case_time on public.sits_audit_events(case_id,created_at desc);
create index sits_audit_actor_time on public.sits_audit_events(actor_user_id,created_at desc);

-- All client writes to sensitive resources go through authenticated Edge Functions.
-- This bounded helper intentionally reveals only a boolean and is not in an exposed schema.
create function sits_private.is_staff()
returns boolean language sql stable security definer set search_path=''
as $$ select exists (select 1 from public.sits_staff_members s
 where s.user_id=(select auth.uid()) and s.active=true) $$;
create function sits_private.is_supervisor()
returns boolean language sql stable security definer set search_path=''
as $$ select exists (select 1 from public.sits_staff_members s
 where s.user_id=(select auth.uid()) and s.active=true and s.role='supervisor') $$;
revoke all on function sits_private.is_staff() from public,anon,authenticated;
revoke all on function sits_private.is_supervisor() from public,anon,authenticated;
grant usage on schema sits_private to authenticated;
grant execute on function sits_private.is_staff() to authenticated;
grant execute on function sits_private.is_supervisor() to authenticated;

create function sits_private.case_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare permitted boolean;
begin
  if tg_op='INSERT' then
    if new.reference is null or new.reference='' then
      new.reference := 'SSP-' || to_char(now() at time zone 'America/Bogota','YYYY') || '-'
        || lpad(nextval('public.sits_case_number_seq')::text,7,'0');
    end if;
    return new;
  end if;
  if new.id is distinct from old.id or new.owner_user_id is distinct from old.owner_user_id
     or new.owner_email is distinct from old.owner_email or new.reference is distinct from old.reference
     or new.service_id is distinct from old.service_id or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'immutable case identity';
  end if;
  if new.revision <> old.revision + 1 then raise exception 'revision conflict'; end if;
  permitted := new.status=old.status or (old.status,new.status) in (
     ('saving','received'),('saving','storage_review'),('storage_review','received'),
     ('received','reviewing'),('reviewing','needs_documents'),
     ('needs_documents','reviewing'),('reviewing','awaiting_certificate'),
     ('reviewing','not_proceed'),('awaiting_certificate','reviewing'),
     ('awaiting_certificate','not_proceed'),('awaiting_certificate','sending'),
     ('sending','delivered'),('sending','available'),('sending','delivery_review'),
     ('delivery_review','delivered'),('delivery_review','available'),
     ('delivered','closed'),('available','closed'),('not_proceed','closed')
  );
  if not permitted then raise exception 'invalid status transition % -> %',old.status,new.status; end if;
  new.updated_at:=now();
  if new.status='closed' then new.closed_at:=coalesce(new.closed_at,now()); end if;
  return new;
end $$;
create trigger sits_case_guard before insert or update on public.sits_cases
for each row execute function sits_private.case_guard();

create function sits_private.case_log_transition()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status is distinct from old.status then
    insert into public.sits_case_events (case_id,actor_user_id,action,old_status,new_status,comment)
    values(new.id,new.updated_by,'status_change',old.status,new.status,coalesce(new.last_action,''));
    insert into public.sits_audit_events(actor_user_id,case_id,event_type)
    values(new.updated_by,new.id,'status:'||new.status);
  end if;
  return null;
end $$;
create trigger sits_case_transition_audit after update on public.sits_cases
for each row execute function sits_private.case_log_transition();

-- Explicit RLS for every exposed table; secure default is no INSERT/UPDATE/DELETE grants or policies.
do $$ declare item record; begin
 for item in select tablename from pg_tables where schemaname='public' and tablename like 'sits_%'
 loop execute format('alter table public.%I enable row level security', item.tablename); end loop;
end $$;
create policy "staff_self" on public.sits_staff_members for select to authenticated
using(user_id=(select auth.uid()));
create policy "profile_self" on public.sits_citizen_profiles for select to authenticated
using(user_id=(select auth.uid()));
create policy "cases_owner_or_staff" on public.sits_cases for select to authenticated
using(owner_user_id=(select auth.uid()) or sits_private.is_staff());
create policy "documents_owner_released_or_staff" on public.sits_case_documents for select to authenticated
using(sits_private.is_staff() or exists(
  select 1 from public.sits_cases c
  where c.id=case_id and c.owner_user_id=(select auth.uid())
    and (kind<>'certificate' or c.status in ('delivered','available','delivery_review','closed'))));
create policy "case_events_owner_or_staff" on public.sits_case_events for select to authenticated
using(exists(select 1 from public.sits_cases c where c.id=case_id
 and (c.owner_user_id=(select auth.uid()) or sits_private.is_staff())));
create policy "consent_owner_or_staff" on public.sits_consent_evidence for select to authenticated
using(owner_user_id=(select auth.uid()) or sits_private.is_staff());
create policy "delivery_staff_only" on public.sits_delivery_attempts for select to authenticated
using(sits_private.is_staff());
create policy "notifications_own_or_staff" on public.sits_notifications for select to authenticated
using(recipient_user_id=(select auth.uid()) or sits_private.is_staff());
create policy "invites_supervisor" on public.sits_staff_invitations for select to authenticated
using(sits_private.is_supervisor());
create policy "rights_owner_or_staff" on public.sits_rights_requests for select to authenticated
using(requester_user_id=(select auth.uid()) or sits_private.is_staff());
create policy "audit_staff" on public.sits_audit_events for select to authenticated
using(sits_private.is_staff());
create policy "public_categories" on public.sits_service_categories for select to anon,authenticated using(active);
create policy "public_services" on public.sits_services for select to anon,authenticated using(active);
create policy "staff_versions" on public.sits_service_versions for select to authenticated using(sits_private.is_staff());
create policy "published_legal" on public.sits_legal_documents for select to anon,authenticated
using(active and published_at<=now());
create policy "published_notices" on public.sits_public_notices for select to anon,authenticated
using(active and published_at<=now() and (expires_at is null or expires_at>now()) and audience in ('all','citizen'));

-- Minimal Data API grants; Edge Functions use a server-only secret for mutating workflows.
revoke all on all tables in schema public from anon,authenticated;
grant select on public.sits_service_categories,public.sits_services,public.sits_legal_documents,public.sits_public_notices to anon;
grant select on public.sits_staff_members,public.sits_citizen_profiles,public.sits_services,
  public.sits_service_categories,public.sits_service_versions,public.sits_legal_documents,
  public.sits_cases,public.sits_case_documents,public.sits_case_events,
  public.sits_consent_evidence,public.sits_delivery_attempts,
  public.sits_notifications,public.sits_staff_invitations,public.sits_public_notices,
  public.sits_rights_requests,public.sits_audit_events to authenticated;

insert into public.sits_service_categories(id,title,sort_order)
values('salud','Servicios de Salud',1);
insert into public.sits_services(id,category_id,title,description,active,form_schema,flow_schema,published_at)
values('certificacion-discapacidad','salud','Certificación de discapacidad',
'Solicitud, revisión de soportes, subsanación y entrega controlada de certificados.',true,
'{"documents":["historia","apoyo"],"maxPdfBytes":4718592}'::jsonb,
'{"states":["received","reviewing","needs_documents","awaiting_certificate","not_proceed","sending","delivered","available","delivery_review","closed"]}'::jsonb,
now());

insert into public.sits_legal_documents(id,version,kind,title,body,content_hash)
select 'policy-'||v.kind,1,v.kind,v.title,v.body,
 encode(sha256(convert_to(v.kind||'|'||v.title||'|'||v.body,'UTF8')),'hex')
from (values
('processing','Finalidad del tratamiento de información','La Alcaldía Municipal de San Pedro, por medio de la Secretaría de Salud, recibe los datos identificativos y los documentos adjuntos para registrar, revisar y gestionar la solicitud de certificación de discapacidad. Los soportes se conservan en un repositorio institucional privado y se consultan únicamente por personal autorizado para esta finalidad.'),
('privacy','Información sobre datos personales','La persona titular podrá ejercer sus derechos de conocimiento, actualización, rectificación, acceso y demás solicitudes legalmente procedentes ante la Secretaría de Salud de San Pedro, mediante los canales institucionales. El correo de contacto es salud@sanpedro-valle.gov.co.'),
('terms','Condiciones de recepción electrónica','Declaro que la información que proporciono corresponde a la solicitud que presento y que conozco el proceso de revisión por la Secretaría de Salud. La referencia de seguimiento SSP no constituye un certificado de discapacidad ni sustituye la radicación o decisiones que deban emitir las autoridades competentes.'),
('sensitive','Datos sensibles de salud','Entiendo que los documentos pueden contener información clínica y datos sensibles de salud. Al presentarlos por este canal manifiesto mi autorización informada para su recepción, custodia y revisión con la finalidad exclusiva de gestionar mi solicitud ante Salud. Si no deseo compartirlos por este medio, puedo consultar los canales de atención de la entidad.')
) as v(kind,title,body);

-- Sensitive PDFs stay in a private Storage bucket. No client storage.objects policies:
-- upload/download/expiring links will be issued by the authenticated Edge Function only.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('sits-salud-private','sits-salud-private',false,4718592,array['application/pdf'])
on conflict(id) do nothing;
