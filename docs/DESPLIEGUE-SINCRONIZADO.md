# Publicación coordinada de SITS Salud

## Arquitectura

- **Vercel:** publica automáticamente el frontend desde la rama `main`.
- **Supabase:** conserva los expedientes oficiales y el catálogo relacional. La edición de categorías/trámites usa `catalog/registry` como fuente autoritativa; un trigger transaccional mantiene `sits_service_categories`, `sits_services` y `sits_service_versions` sincronizados.
- **Google Apps Script:** procesa archivos privados en Drive y notificaciones. **No lo despliega Vercel.** La acción `Apps Script | despliegue sincronizado` sincroniza el código, crea una nueva versión del despliegue Web App existente y comprueba la huella del commit.

## Configuración requerida para activar Apps Script CI

En **Settings → Secrets and variables → Actions** del repositorio, configure los siguientes elementos de manera segura:

**Secrets** (no ingresarlos en archivos de Git ni en mensajes públicos):
- `SITS_CLASPRC_JSON`: contenido de `~/.clasprc.json` del usuario autorizado que administra el Apps Script oficial, generado con `clasp login`.
- `SITS_APPS_SCRIPT_ID`: ID del proyecto Apps Script (no es el ID de despliegue).
- `SITS_APPS_SCRIPT_DEPLOYMENT_ID`: ID **existente** del Web App público que se debe actualizar sin cambiar su URL.

**Variables**:
- `SITS_APPS_SCRIPT_WEBAPP_URL`: URL oficial completa de ese Web App.
- `SITS_AUTO_APPS_SCRIPT_DEPLOY`: establecer `enabled` para el despliegue automático cuando cambien archivos en `apps-script/spark` de `main`.

La primera activación debe probarse manualmente desde **Actions → Apps Script | despliegue sincronizado → Run workflow**, y después confirmar que la ejecución terminó con verificación remota satisfactoria. Hasta configurar esos parámetros, el despliegue automático permanece desactivado por seguridad; la ejecución manual sin credenciales termina con un error explícito y no cambia Apps Script.

## Verificación de versiones

`GET /exec?probe=sits-supabase-v1&content=release-info` responde con `build`, `sourceCommit` y `backendEnabled`, sin datos privados. La acción de despliegue exige que `sourceCommit` sea exactamente el commit de GitHub publicado.

**No basta con la marca READY de Vercel**: una publicación de frontend puede estar activa mientras Apps Script ejecuta una versión anterior. Ante una incompatibilidad, no habilite un trámite público nuevo: el flujo oficial existente debe conservarse y debe verificarse el backend.

## Reversión y operación segura

1. Si un fallo afecta solicitudes reales, primero cierre **la recepción del servicio afectado** (cuando exista habilitación por servicio). No elimine expedientes ni archivos.
2. Restaure el último despliegue estable de Vercel y la versión anterior conocida de Apps Script, usando el **mismo ID de despliegue**.
3. Confirme autenticación, registro, Drive, subsanación, certificado y MailApp, antes de reabrir.
4. Conserve registros y hashes de expedientes; no reconstruya colecciones ni fuerce borrados.

## Estado del motor de trámites

Las categorías prediseñadas y su espejo relacional **no** implican autorización para aceptar trámites nuevos. La recepción pública de cada servicio configurable debe activarse únicamente cuando cuente con esquema versionado, reglas de documentos, responsables, evidencia de pruebas y aprobación institucional. La certificación oficial de discapacidad conserva el flujo validado de producción.
