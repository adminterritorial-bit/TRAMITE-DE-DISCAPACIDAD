# SITS Salud — migración controlada Firebase → Supabase + Google Drive

**Proyecto Supabase:** \`ovppffchdkwbikdppuzh\` · Región \`us-east-1\`  
**Repositorio:** \`adminterritorial-bit/TRAMITE-DE-DISCAPACIDAD\`  
**Rama de integración:** \`feat/supabase-drive-backend\`

## Actualización del 24 de noviembre de 2026: integración por etapas

- Google OAuth Provider y Site URL/Redirect URLs configurados y habilitados en Supabase.
- Las dos cuentas institucionales quedan reservadas como `supervisor`, con invitaciones activas; ninguna accede como supervisor mientras no haya iniciado sesión con Google. `salud@sanpedro-valle.gov.co` sigue sin email confirmado; el servicio debe recibir una identidad real Google y un correo verificado antes de conceder permisos.
- La rama `feat/supabase-drive-backend` integra el cliente Google OAuth de Supabase y la comprobación de compatibilidad del Apps Script (build `sits-supabase-1.0`).
- **No está publicado el código de Apps Script ni integrados los archivos, correos y trámites de extremo a extremo.** Las rutas de catálogo institucional y gestión legal heredadas de Firestore requieren migración propia. La publicación oficial debe permanecer intacta hasta finalizar el corte.
- El adaptador admite `SITS_SB_SECRET_KEY` (nueva llave secret) en Script Properties, alternativa temporal a `SITS_SB_SERVICE_ROLE_JWT`, sin exponerla al navegador. Se emplea encabezado `apikey` para llaves `sb_...`, no `Authorization`.
- **Modo `dual` de Apps Script:** habilita las solicitudes Supabase con `probe=sits-supabase-v1` y preserva el manejo del antiguo cliente Firebase con `probe=spark-pilot-v1`. **Este es el modo para las pruebas con el portal anterior aún publicado.**
- **Modo `supabase`:** recibe solamente el protocolo Supabase y rechaza Firebase antiguo. Activarlo solo después de publicar frontend definitivo, migrar todos los módulos dependientes y superar pruebas reales.
- **Modo `firebase` (o propiedad ausente):** atiende solamente Firebase y rechaza el protocolo Supabase.

### Guía operativa sin secretos en el chat

1. En el editor Google Apps Script propietario del despliegue /exec existente, preservar un respaldo y publicar una nueva versión del mismo proyecto con el paquete adjunto por CI `apps-script-salud-release`: `Codigo.gs`, `SparkAuth.gs`, `ServiceCatalog.gs`, `SupabaseBridge.gs`, `appsscript.json`.
2. Configurar Script Properties `SITS_SB_PUBLISHABLE_KEY` con la llave pública de Supabase y `SITS_SB_SECRET_KEY` con la nueva llave secreta, obtenida en Supabase → Project Settings → API Keys. Conservar las propiedades originales, especialmente `ROOT_FOLDER_ID`, y los permisos de Drive/MailApp.
3. Definir `SITS_BACKEND_MODE=dual` antes de probar el frontend de la rama. Nunca cambiarlo directamente a `supabase` cuando el sitio de producción aún tenga sesiones Firebase.
4. Confirmar vía GET `/exec?probe=sits-supabase-v1&content=official-intake` que responde `build=sits-supabase-1.0`, `ok=true`, `enabled=true` y 4 políticas legales (sin poner credenciales en la URL).
5. Agregar el dominio exacto de **vista previa** de Vercel en Authentication → Redirect URLs de Supabase, solo durante pruebas autorizadas. Las cuentas institucionales deben completar personalmente el ingreso con Google; no confirmar su correo vía SQL ni transferir claves.
6. Ejecutar flujo de pruebas con PDFs exclusivamente ficticios y un correo de recepción de prueba autorizado. Verificar creación, lectura, subsanación, Drive privado, certificado, MailApp, deduplicación, aislamiento entre ciudadanos y archivo.
7. Migrar o desactivar formalmente los módulos públicos de catálogo y legales todavía conectados a Firestore, ejecutar suite verde y realizar un corte coordinado de Apps Script + Vercel; solo entonces cambiar `SITS_BACKEND_MODE=supabase` y promover a producción.

## Estado real y alcance

- Aplicadas y verificadas en Supabase las migraciones \`20261124041707\` (estructura inicial), \`20261124042133\` (Drive/RPC/RLS) y \`20261124042700\` (identidad institucional e índices).
- Se conserva **todo el código de Firebase y Apps Script anterior**, y la producción publicada en Vercel continúa usando Firebase hasta completar pruebas.
- Adaptador \`apps-script/spark/SupabaseBridge.gs\` **preparado en GitHub, pero NO desplegado** en los proyectos existentes de Apps Script.
- No se migran expedientes ficticios. Supabase no almacena archivos médicos, PDFs ni correos: solamente metadatos, hashes, versiones, referencias protegidas, cambios de estado y auditoría.
- **No se habilita la recepción con datos reales ni se otorgan roles sin autorización de la entidad.** La base lista para desarrollo no constituye autorización institucional.

## Arquitectura de destino

\`\`\`text
Portal SITS Salud / Vercel
    │
    ├─ Supabase Auth (Google OAuth, cuentas verificadas)
    ├─ Supabase PostgreSQL (RLS / trámites / auditoría / invitaciones)
    │    └─ esquema privado: referencias de Google Drive
    └─ Google Apps Script actual (cuenta institucional Salud)
         ├─ verifica el access token Supabase contra Auth
         ├─ mantiene ROOT_FOLDER_ID sin cambiar propietario
         ├─ archiva/lee PDFs en carpeta privada de Google Drive
         ├─ notifica por MailApp al correo autorizado
         └─ registra resultado en Postgres mediante RPC de servidor
\`\`\`

No se requieren buckets ni archivos en Supabase Storage.

## Configuración pendiente para cortar a Supabase

1. Configurar **Google OAuth Provider** en Supabase Authentication y las URLs de redirección de Vercel, con los dominios/clientes institucionales autorizados. Validar acceso real a través de Supabase Auth. No reemplazar esta verificación por coincidencia de correo.
2. Registrar los funcionarios habilitados mediante invitaciones institucionales controladas; las tablas están vacías. El rol para actuaciones en expedientes clínicos es \`admin\` o \`supervisor\`, y debe corresponder a una cuenta Google verificada \`@sanpedro-valle.gov.co\`. No hay un supervisor automático.
3. Publicar en **el proyecto Apps Script que ya es propietario de Drive** el paquete de \`node scripts/prepare-spark.mjs\`, conservando \`Codigo.gs\`, \`SparkAuth.gs\`, \`ServiceCatalog.gs\`, \`appsscript.json\` y las Script Properties originales. La copia debe incluir el nuevo \`SupabaseBridge.gs\`.
4. Añadir en Script Properties de Apps Script, *no* en JavaScript del navegador ni en GitHub:
   - \`SITS_SB_PUBLISHABLE_KEY\`: llave publicable de Supabase
   - \`SITS_SB_SERVICE_ROLE_JWT\`: credencial privilegiada de backend **legacy**, exclusiva del servidor; validar su vigencia y plan de transición a secret API keys antes del corte
   - \`SITS_BACKEND_MODE\`: iniciar con valor distinto de \`supabase\`; cambiar a \`supabase\` únicamente después de las pruebas y el respaldo
   - Conservar \`ROOT_FOLDER_ID\`, \`HMAC_KEY\`, permisos de Google Drive/Mail y demás propiedades actuales sin imprimir sus valores.
5. Implementar y probar el cliente Supabase Auth en el portal, usando solamente la **llave publicable** y enviando el JWT del usuario autenticado en \`accessToken\` al mismo endpoint Apps Script con \`probe=sits-supabase-v1\`. El frontend **aún no está migrado**; no activar el modo Supabase mientras el cliente siga enviando tokens Firebase.
6. Probar con **archivos PDF ficticios** en un proyecto de prueba: inicio sesión ciudadano, registro/consentimiento, idempotencia, Drive privado, bandeja operador autorizado, corrección de soporte, certificado, correo autorizado, caso incierto, descarga y archivo. Comprobar al menos dos sesiones separadas para rechazar lectura de otro ciudadano.
7. Después de aprobación administrativa y pruebas completas, activar la variable de modo en Apps Script, actualizar el portal y desplegar la versión probada; conservar opción de rollback a Firebase mientras no existan expedientes reales en Supabase.

## Seguridad y restricciones

- Las 16 tablas \`public.sits_*\` poseen RLS; los usuarios no tienen INSERT directo de expedientes/documentos, deben usar RPC validados.
- Las referencias \`drive_file_id\` permanecen en \`sits_private.drive_objects\`, sin SELECT a \`anon\` ni \`authenticated\`.
- Las funciones \`SECURITY DEFINER\` accesibles por autenticados operan como endpoints públicos de negocio y verifican identidad o rol. Mantener la revisión de estos permisos en cada cambio. **Nunca** conceder EXECUTE sobre funciones de entrega/Drive al cliente.
- El verificador de roles institucionales exige vínculo de cuenta Google, correo verificado, estado activo y rol correspondiente. No utilizar \`user_metadata\` para acceso.
- Los eventos de aplicación son datos operativos; no incluir historia clínica, contenido PDF, documentos de identidad ni JWT en logs.
- Las respuestas de email tienen estado \`uncertain\` en fallos y requieren comprobación; no reintentar envío automáticamente porque podría duplicar certificaciones.
- La clave \`service_role\` / secret solo vive en un contexto confiable de servidor. Verificar la compatibilidad y rotación de credenciales recientes de Supabase al conectar el proyecto.

## Pruebas de contrato realizadas

Se comprobó en SQL Editor: RLS activo en las 16 tablas, acceso anónimo denegado a los expedientes, escrituras clínicas directas denegadas, RPC de entrega/archivo accesibles exclusivamente al backend, cuatro documentos legales disponibles, valor predeterminado de Drive y estructura sin casos reales.

\`supabase/tests/security_contracts.sql\` permite volver a comprobar los invariantes sin crear ciudadanos o expedientes. **Las pruebas integrales con OAuth Google, Apps Script publicado, MailApp y Drive NO están ejecutadas**. No afirmar sistema en producción migrado antes de realizarlas.

## Reversión

- El frontend permanece en producción con Firebase, por lo cual un despliegue inadvertido de la rama de integración no debe darse por aprobado.
- El enrutamiento Apps Script usa \`SITS_BACKEND_MODE\`. Restablecerlo a \`firebase\` (u otro valor distinto de \`supabase\`) para volver a \`spHandle_\`, sin borrar \`Codigo.gs\` ni archivos de Drive.
- No se recomienda borrar migraciones ni tablas; revertir aplicaciones por despliegue/versiones comprobadas. Hacer copia de seguridad y revisar casos en tránsito antes de cualquier reversión si ya existen datos reales.

## Pendientes explícitos

**La base estructural está lista y versionada; el sistema completo no está migrado.** Falta configurar Google OAuth, habilitar identidades/funcionarios, completar el cliente web Supabase, desplegar Apps Script autorizado y ejecutar pruebas reales. El adaptador está en rama y es susceptible de correcciones tras dichas pruebas.
