-- SITS Salud: read-only security contract for Supabase, no synthetic citizens or actual records.
-- Run from SQL Editor after applying migrations. Raises on an insecure regression.
DO $$
DECLARE n integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relkind='r' AND c.relname LIKE 'sits_%' AND NOT c.relrowsecurity
  ) THEN RAISE EXCEPTION 'SITS clinical table has RLS disabled'; END IF;
  IF has_table_privilege('anon','public.sits_cases','SELECT') OR
     has_table_privilege('anon','public.sits_cases','INSERT')
  THEN RAISE EXCEPTION 'Anonymous client granted case access'; END IF;
  IF has_table_privilege('authenticated','public.sits_cases','INSERT') OR
     has_table_privilege('authenticated','public.sits_case_documents','INSERT')
  THEN RAISE EXCEPTION 'User can bypass server-side workflow'; END IF;
  IF has_function_privilege('anon','public.sits_create_case(jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'Anonymous case creation exposed'; END IF;
  IF has_function_privilege('authenticated','public.sits_drive_document_saved(uuid,text,text,text,bigint,text,boolean)','EXECUTE') OR
     has_function_privilege('authenticated','public.sits_drive_delivery_result(uuid,text,text)','EXECUTE') OR
     has_function_privilege('authenticated','public.sits_drive_document_reference(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'User can forge Google Drive metadata / delivery'; END IF;
  IF NOT has_function_privilege('service_role','public.sits_drive_delivery_result(uuid,text,text)','EXECUTE')
  THEN RAISE EXCEPTION 'Trusted backend cannot record delivery'; END IF;
  IF (SELECT column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='sits_case_documents'
      AND column_name='storage_bucket') IS DISTINCT FROM '''google-drive''::text'
  THEN RAISE EXCEPTION 'PDFs must remain in Google Drive'; END IF;
  IF (SELECT COUNT(*) FROM public.sits_legal_documents
      WHERE active AND kind IN ('processing','privacy','terms','sensitive'))<>4
  THEN RAISE EXCEPTION 'Required legal versions missing'; END IF;
  SELECT COUNT(*) INTO n FROM pg_indexes
   WHERE schemaname='public' AND indexname IN
    ('sits_cases_owner_created','sits_cases_status_created','sits_documents_case');
  IF n<>3 THEN RAISE EXCEPTION 'Core case indexes missing'; END IF;
END $$;
SELECT 'PASS' AS result, 'RLS, RPC privileges, Google Drive and legal notices' AS scope;
