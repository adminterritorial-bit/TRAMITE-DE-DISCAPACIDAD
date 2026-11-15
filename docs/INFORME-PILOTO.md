# Informe de verificación del piloto cerrado

## Resultado comprobado el 15 de noviembre de 2026

- La demostración publicada en GitHub Pages respondió con HTTP 200 y mostró el nuevo filtro de estados. El despliegue de main terminó correctamente. [Ejecución de GitHub Actions](https://github.com/adminterritorial-bit/TRAMITE-DE-DISCAPACIDAD/actions/runs/43763978830).
- Firebase Hosting respondió con HTTP 404. La consulta de aplicaciones de `tramite-discapacidad` devolvió HTTP 403 con la sesión local de Firebase.
- La auditoría de las dependencias de Functions reportó cero vulnerabilidades tras actualizar Firebase Admin y Firebase Functions y fijar el árbol con un lockfile.
- La suite automatizada verifica el perfil de prueba, los PDF aprobados, el acceso ciudadano a certificados, los contratos de seguridad y la integración de ambos scripts con dobles de Drive y correo. No se enviaron correos ni se almacenaron expedientes en servicios institucionales durante estas pruebas.
- Los emuladores de Authentication y Firestore verificaron reglas de acceso directo, separación entre titulares, roles, autenticación reciente para la entrega, retiro de acceso, solicitud y recepción de soportes de subsanación e historial. El puente hacia Apps Script se sustituyó por un doble local en esta prueba.
- Chromium completó la solicitud, el acuse, el seguimiento y la gestión administrativa de la demostración. Se comprobó el filtro de estados, el diseño a 1440, 768, 390 y 320 px y reglas automatizadas de WCAG 2.1 AA en las vistas recorridas.

## Verificación pendiente en servicios institucionales

- Iniciar sesión con acceso al proyecto Firebase y con la cuenta de Salud autorizada para Apps Script y Drive. Revisar los recursos existentes antes de desplegar reglas o modificar la configuración.
- Configurar y comprobar WIF, App Check, Authentication, MFA institucional, Firestore, los permisos de Drive, las propiedades de ambos scripts y el despliegue mediante GitHub Actions.
- Ejecutar el ciclo con dos cuentas ciudadanas permitidas, un operador y un supervisor. Confirmar entrega de correo, denegación entre titulares, descarga privada, conciliación tras interrupciones y eliminación de accesos al retirar un rol.
- Integrar el radicador oficial con el contrato de la entidad. Completar gestión de usuarios, recuperación operativa, escaneo de contenidos para producción, pruebas de seguridad y auditoría manual de accesibilidad. Los tamaños de vista se comprobaron en Chromium mediante emulación.
- Mantener el piloto limitado a sus datos y PDF ficticios hasta verificar seguridad y radicación oficial y contar con la aprobación institucional para el tratamiento de datos personales y clínicos.
