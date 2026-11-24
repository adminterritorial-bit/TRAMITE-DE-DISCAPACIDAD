# SITS Salud — archivos para DISCAPACIDAD - Recepción

**Proyecto de Google Apps Script**: DISCAPACIDAD - Recepción.

| Archivo en el proyecto | Copiar desde | Acción |
| --- | --- | --- |
| Codigo.gs | Codigo.gs de esta carpeta | Reemplazar todo el contenido, conservando el nombre Codigo.gs |
| SparkAuth.gs | SparkAuth.gs de esta carpeta | Sustituir si es una versión anterior; no crear duplicado |
| ServiceCatalog.gs | ServiceCatalog.gs de esta carpeta | Sustituir si es una versión anterior; no crear duplicado |
| appsscript.json | — | Mantener el manifiesto ya configurado |

**No** pegar los tres archivos dentro de Codigo.gs, pues duplicaría constantes y funciones.
**No** modificar DISCAPACIDAD - Entrega.

Después de guardar, abrir **Implementar → Administrar implementaciones → editar aplicación web → Nueva versión → Implementar**, conservando la URL existente. Activar recepción clínica solo después de comprobar las aprobaciones institucionales reales, las políticas publicadas, los controles de seguridad y las propiedades definidas en docs/RECEPCION-INSTITUCIONAL.md.

Los archivos son una copia exacta del código fuente del repositorio en el commit 27aedf6dd3999b780d4a76e11ee2449517187843. El paquete no cambia el backend automáticamente; publicar en Apps Script es un paso separado.
