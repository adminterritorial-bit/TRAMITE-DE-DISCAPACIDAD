# ÚLTIMA ACTUALIZACIÓN — DISCAPACIDAD - Recepción

## SOLO REEMPLAZAR 1 ARCHIVO

1. Abre el proyecto **DISCAPACIDAD - Recepción**: https://script.google.com/d/1ZpPq057pTZZBKSspD7oqqHDPxupIegLqvcyDkPKIXiJRFj2vjRSyI4HO/edit
2. En el panel Archivos, abre el archivo **Codigo.gs** que ya existe.
3. Guarda respaldo, borra su contenido y pega **todo el texto** del archivo `Codigo.gs` de esta carpeta.
4. Guarda (Ctrl+S).
5. **Implementar → Administrar implementaciones → editar la aplicación web existente → Nueva versión → Implementar**. NO crear una implementación nueva; conservar la URL `/exec`.

**No tocar**: `SparkAuth.gs`, `ServiceCatalog.gs`, `appsscript.json`, `DISCAPACIDAD - Entrega`, claves, configuraciones existentes, Vercel ni Firebase.

La recepción oficial se habilita a partir de los servicios institucionales ya configurados (Drive privado y Firestore), sin referencias inventadas ni cuatro interruptores de aprobación. Sigue requiriendo Google/Firebase, App Check, restricciones de acceso a expedientes y decisiones informadas del ciudadano. Si la carpeta de Drive no existe, es compartida públicamente o falta acceso al servidor, la carga se mantiene inactiva y debe corregirse esa configuración; no se debe simular una recepción exitosa.

Después de publicar, el enlace `/exec?content=official-intake` deberá responder con JSON `ok:true`, `enabled:true` y cuatro documentos informativos. En el portal aparecerá el formulario para una cuenta Google autenticada. El número de seguimiento no reemplaza un número oficial de radicación.

Código fuente: `a61d0f27c6fa08fd232ccc281ca2136730e2bfa9`.
