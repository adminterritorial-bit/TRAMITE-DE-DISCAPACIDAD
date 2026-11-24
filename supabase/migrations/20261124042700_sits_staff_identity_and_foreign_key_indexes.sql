-- Harden institutional access: roles are valid only while email, provider and account agree.
-- Both service permissions and row-level policies use these private server-side checks.
create or replace function sits_private.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists (
   select 1 from public.sits_staff_members s
   join auth.users u on u.id=s.user_id
   where s.user_id=(select auth.uid())
     and s.active=true
     and u.email_confirmed_at is not null
     and u.banned_until is null
     and lower(u.email)=s.institutional_email
     and lower(u.email) like '%@sanpedro-valle.gov.co'
     and exists(select 1 from auth.identities i
       where i.user_id=u.id and i.provider='google'
         and lower(i.identity_data->>'email')=lower(u.email))
 );
$$;

create or replace function sits_private.is_supervisor()
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists (
   select 1 from public.sits_staff_members s
   join auth.users u on u.id=s.user_id
   where s.user_id=(select auth.uid()) and s.active=true
     and s.role='supervisor'
     and u.email_confirmed_at is not null
     and u.banned_until is null
     and lower(u.email)=s.institutional_email
     and lower(u.email) like '%@sanpedro-valle.gov.co'
     and exists(select 1 from auth.identities i
       where i.user_id=u.id and i.provider='google'
         and lower(i.identity_data->>'email')=lower(u.email))
 );
$$;

create or replace function sits_private.is_case_officer()
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists (
   select 1 from public.sits_staff_members s
   join auth.users u on u.id=s.user_id
   where s.user_id=(select auth.uid()) and s.active=true
     and s.role in ('admin','supervisor')
     and u.email_confirmed_at is not null
     and u.banned_until is null
     and lower(u.email)=s.institutional_email
     and lower(u.email) like '%@sanpedro-valle.gov.co'
     and exists(select 1 from auth.identities i
       where i.user_id=u.id and i.provider='google'
         and lower(i.identity_data->>'email')=lower(u.email))
 );
$$;

revoke all on function sits_private.is_staff() from public, anon;
revoke all on function sits_private.is_supervisor() from public, anon;
revoke all on function sits_private.is_case_officer() from public, anon;
grant execute on function sits_private.is_staff() to authenticated;
grant execute on function sits_private.is_supervisor() to authenticated;
grant execute on function sits_private.is_case_officer() to authenticated;

-- Foreign key indexes used in case lifecycle, legal evidence, notifications and admin.
create index if not exists sits_case_documents_uploaded_by_idx on public.sits_case_documents(uploaded_by);
create index if not exists sits_case_events_actor_user_id_idx on public.sits_case_events(actor_user_id);
create index if not exists sits_cases_updated_by_idx on public.sits_cases(updated_by);
create index if not exists sits_consent_evidence_legal_idx on public.sits_consent_evidence(document_id,version);
create index if not exists sits_consent_evidence_owner_idx on public.sits_consent_evidence(owner_user_id);
create index if not exists sits_delivery_attempts_document_idx on public.sits_delivery_attempts(document_id);
create index if not exists sits_delivery_attempts_requested_by_idx on public.sits_delivery_attempts(requested_by);
create index if not exists sits_notifications_case_idx on public.sits_notifications(case_id);
create index if not exists sits_notifications_recipient_idx on public.sits_notifications(recipient_user_id);
create index if not exists sits_rights_requests_assigned_idx on public.sits_rights_requests(assigned_to);
create index if not exists sits_rights_requests_case_idx on public.sits_rights_requests(case_id);
create index if not exists sits_service_versions_published_by_idx on public.sits_service_versions(published_by);
create index if not exists sits_services_category_idx on public.sits_services(category_id);
create index if not exists sits_staff_invitations_claimed_idx on public.sits_staff_invitations(claimed_by);
create index if not exists sits_staff_invitations_issued_idx on public.sits_staff_invitations(issued_by);
