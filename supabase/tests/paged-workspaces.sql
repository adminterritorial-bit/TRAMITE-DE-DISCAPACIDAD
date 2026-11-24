-- Run on a disposable database. Fixtures always roll back.
begin;
insert into auth.users(id,email,email_confirmed_at,aud,role) values
 ('ae100000-0000-4000-8000-000000000001','fixture-a@example.invalid',now(),'authenticated','authenticated'),
 ('ae100000-0000-4000-8000-000000000002','fixture-b@example.invalid',now(),'authenticated','authenticated'),
 ('ae100000-0000-4000-8000-000000000003','fixture-supervisor@sanpedro-valle.gov.co',now(),'authenticated','authenticated');
insert into auth.identities(user_id,provider,provider_id,identity_data)
 values ('ae100000-0000-4000-8000-000000000003','google','sits-qa-paged-fixture','{"email":"fixture-supervisor@sanpedro-valle.gov.co","email_verified":true}');
insert into public.sits_staff_members(user_id,institutional_email,role,active)
 values ('ae100000-0000-4000-8000-000000000003','fixture-supervisor@sanpedro-valle.gov.co','supervisor',true);
update sits_private.intake_control set test_emails=test_emails||array['fixture-a@example.invalid','fixture-b@example.invalid'];
insert into public.sits_cases(id,reference,service_id,owner_user_id,owner_email,idempotency_key,applicant_name,
 document_type,document_number,residence_zone,representation,status,assigned_to,created_at)
values
 ('ae200000-0000-4000-8000-000000000001','QA-FILTRO-1','certificacion-discapacidad','ae100000-0000-4000-8000-000000000001',
 'fixture-a@example.invalid','ae300000-0000-4000-8000-000000000001','Persona de prueba','CC','TEST001','Cabecera municipal','propia','received',null,'2026-10-01T12:00:00Z'),
 ('ae200000-0000-4000-8000-000000000002','QA-FILTRO-2','certificacion-discapacidad','ae100000-0000-4000-8000-000000000002',
 'fixture-b@example.invalid','ae300000-0000-4000-8000-000000000002','Persona de prueba','CC','TEST001','Cabecera municipal','propia','awaiting_certificate','ae100000-0000-4000-8000-000000000003','2026-10-03T12:00:00Z');
set local role anon;
do $$ begin
 if public.sits_intake_availability() is distinct from false then raise exception 'Public intake expected closed'; end if;
 if has_function_privilege(current_user,'public.sits_case_workspace(boolean,jsonb)','execute') then raise exception 'Anonymous workspace access'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ae100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$ declare data jsonb; begin
 data:=public.sits_case_workspace(false,'{}');
 if (data->>'total')::int<>1 or data->'items'->0->>'reference'<>'QA-FILTRO-1' then raise exception 'Citizen isolation failed'; end if;
 if (data->'items'->0) ? 'name' then raise exception 'Unnecessary citizen list fields'; end if;
 begin
  perform public.sits_case_workspace(true,'{}'); raise exception 'Citizen staff access';
 exception when insufficient_privilege then null; end;
 data:=public.sits_case_workspace(false,'{"search":"QA-FILTRO-2"}');
 if (data->>'total')::int<>0 then raise exception 'Search exposed another citizen'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"ae100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$ declare data jsonb; begin
 data:=public.sits_case_workspace(true,'{"size":1,"page":1}');
 if (data->>'total')::int<>2 or data->'items'->0->>'reference'<>'QA-FILTRO-2' then raise exception 'Staff first page failed'; end if;
 if (data->'metrics'->>'received')::int<>1 or jsonb_array_length(data->'activity')<>2 then raise exception 'Metrics failed'; end if;
 data:=public.sits_case_workspace(true,'{"size":1,"page":2}');
 if data->'items'->0->>'reference'<>'QA-FILTRO-1' then raise exception 'Staff second page failed'; end if;
 data:=public.sits_case_workspace(true,'{"owner":"me","from":"2026-10-03","to":"2026-10-03","task":"pending"}');
 if (data->>'total')::int<>1 or data->'items'->0->>'reference'<>'QA-FILTRO-2' then raise exception 'Filter failed'; end if;
end $$;
reset role;
select 'PASS' as paged_case_and_permissions;
rollback;
