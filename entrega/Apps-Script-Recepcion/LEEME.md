# SITS Salud — actualización del servidor de recepción
## Reemplaza solamente Codigo.gs en DISCAPACIDAD - Recepción

Este paquete contiene las funciones nuevas de recepción de documentos, gestión de estados, solicitud de subsanación, registro de historial y carga de certificado con entrega por correo **solo cuando el ciudadano lo autorizó expresamente**. El envío se registra para evitar correos duplicados. Si hay incertidumbre, aparece "Envío por verificar" y no se reenvía automáticamente.

1. Abre el proyecto institucional **DISCAPACIDAD - Recepción** en Google Apps Script.
2. Haz una copia del contenido actual del archivo **Codigo.gs**.
3. Reemplaza íntegramente **Codigo.gs** por el archivo homónimo de esta carpeta.
4. Conserva sin cambios **SparkAuth.gs**, **ServiceCatalog.gs** y **appsscript.json**, sin copiar funciones duplicadas ni agregar un proyecto nuevo.
5. Guarda; abre **Implementar → Administrar implementaciones**, edita la aplicación web ya existente, selecciona **Nueva versión** e implementa. Conserva la misma URL /exec.
6. Actualiza el portal y confirma en un expediente autorizado las operaciones de escritura de Firestore, consulta de documentos privados, envío de certificado y acceso del titular.

**El despliegue de GitHub/Vercel no actualiza Apps Script automáticamente.** Para documentos clínicos, no marques como entregado un envío con resultado incierto; utiliza la verificación del registro. El PDF debe ser el certificado efectivamente expedido por la autoridad competente.
