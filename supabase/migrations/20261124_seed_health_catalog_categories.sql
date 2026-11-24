-- SITS Salud: preconfigure categories in the canonical versioned catalog registry.
-- No services, records or public intake configuration are created/modified.
-- Idempotent and additive: existing categories and services always win.
DO $seed$
DECLARE
  presets jsonb := '[{"id":"salud","title":"Servicios generales de salud","active":true},{"id":"discapacidad-apoyos","title":"Discapacidad y apoyos","active":true},{"id":"eps-afiliaciones","title":"EPS, afiliaciones y traslados","active":true},{"id":"regimen-subsidiado","title":"Régimen subsidiado","active":true},{"id":"citas-autorizaciones","title":"Citas, autorizaciones y remisiones","active":true},{"id":"medicamentos","title":"Medicamentos y tratamientos","active":true},{"id":"vacunacion","title":"Vacunación","active":true},{"id":"salud-publica","title":"Salud pública y vigilancia epidemiológica","active":true},{"id":"promocion-prevencion","title":"Promoción de la salud y prevención","active":true},{"id":"salud-mental","title":"Salud mental y apoyo psicosocial","active":true},{"id":"poblaciones-prioritarias","title":"Atención a poblaciones prioritarias","active":true},{"id":"inspeccion-sanitaria","title":"Inspección sanitaria y saneamiento","active":true},{"id":"pqrs-salud","title":"PQRS en salud y orientación al usuario","active":true}]'::jsonb;
  item jsonb;
  existing jsonb;
  registry jsonb;
  changed boolean := false;
BEGIN
  -- Same transaction lock used by sits_portal_commit to preserve concurrency.
  PERFORM pg_advisory_xact_lock(593624011);
  SELECT data INTO registry
  FROM public.sits_portal_records
  WHERE collection='catalog' AND record_id='registry'
  FOR UPDATE;
  IF registry IS NULL THEN
    INSERT INTO public.sits_portal_records(collection, record_id, data)
    VALUES ('catalog','registry',
      jsonb_build_object('categories',presets,'services','[]'::jsonb,
                        'updatedAt',to_jsonb(floor(extract(epoch FROM now())*1000)::bigint)));
    RETURN;
  END IF;
  existing := COALESCE(registry->'categories','[]'::jsonb);
  IF jsonb_typeof(existing) <> 'array' THEN
    RAISE EXCEPTION 'catalog_categories_corrupt';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(presets)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(existing) AS x(value)
                   WHERE x.value->>'id'=item->>'id') THEN
      existing := existing || jsonb_build_array(item);
      changed := true;
    END IF;
  END LOOP;
  IF changed THEN
    IF jsonb_array_length(existing)>20 THEN RAISE EXCEPTION 'catalog_category_limit'; END IF;
    UPDATE public.sits_portal_records
    SET data=jsonb_set(data,'{categories}',existing,true) ||
             jsonb_build_object('updatedAt',to_jsonb(floor(extract(epoch FROM now())*1000)::bigint)),
        revision=revision+1
    WHERE collection='catalog' AND record_id='registry';
  END IF;
END
$seed$;
