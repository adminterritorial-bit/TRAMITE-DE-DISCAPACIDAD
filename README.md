# Portal de certificación de discapacidad — San Pedro

Alcaldía Municipal de San Pedro · Secretaría de Salud · Gestión TIC.

**Piloto cerrado. No habilitado para radicación oficial ni datos clínicos reales.**

## Módulos
- Portal ciudadano HTML/CSS/JS: formulario de tres pasos, contraste, ampliación de texto y consulta de solicitudes.
- Panel de Salud: acceso Google institucional con lista de autorización, bandeja, estados, soportes y entrega de certificado oficial.
- Firebase Authentication, Firestore y Cloud Functions: autenticación, App Check, validación, auditoría y reglas de denegación por defecto.
- Dos Google Apps Script: recepción y archivo en Drive con notificaciones; archivo del certificado y entrega por correo con acceso autenticado al portal.

## Explorar
Ejecutar `python -m http.server 8080 --directory public` y abrir http://localhost:8080/ para la demostración local sin Firebase. No introducir datos reales. La configuración de conexión está en [docs/INSTALACION.md](docs/INSTALACION.md).

## Seguridad
No almacenar secretos, datos personales o PDFs en GitHub. Los archivos se guardan en una carpeta privada de Drive (sin enlaces públicos). La base de datos registra metadatos, no PDFs. Ningún sistema es invulnerable: revisión de seguridad, accesibilidad, cumplimiento y pruebas de integración obligatorias antes de producción. La emisión clínica oficial no es responsabilidad de esta aplicación.
