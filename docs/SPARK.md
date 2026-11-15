# Ruta sin facturación (Spark)

Decisión: no activar facturación. Se conserva Firebase Authentication, Firestore, App Check, frontend de GitHub Pages y las dos implementaciones Apps Script existentes bajo Salud. Cloud Functions y Secret Manager quedan fuera del despliegue vigente. El flujo Blaze está archivado en código con su job desactivado.

## Prueba de viabilidad, sin escribir datos
En el script de Recepción existente añadir el archivo Firestore.gs de apps-script/pruebas y ampliar su manifiesto con los scopes datastore y script.external_request (mantener Drive y Mail). Ejecutar testFirestoreConnection exclusivamente desde el editor con la cuenta de Salud. No es necesario modificar la implementación publicada para la prueba. HTTP 200 confirma lectura por REST; 401/403 requieren revisar scopes, IAM y API habilitada. No habilitar facturación si se solicita. La prueba no registra el token ni el contenido de documentos.

## Diseño objetivo (pendiente de implementación y pruebas)
Adaptar la capa de servidor a Apps Script con OAuth de Google para Firestore REST e IAM de mínimo privilegio, y validación del ID token Firebase por servidor, cuenta activa, rol, propiedad, revocación y App Check. Las claves HMAC siguen en Script Properties; nunca en el cliente. Las reglas Firestore siguen denegando acceso directo de clientes. Verificar transporte y CORS, concurrencia, cuotas, descargas/archivado y auditoría antes de activar. Evitar TTL de pago y planificar limpieza controlada. Mantener datos ficticios únicamente y demo desconectada mientras se valida. No publicar un endpoint privilegiado sin validación completa. No se han ejecutado estas pruebas en servicios reales. La propuesta no garantiza disponibilidad ni costo futuro más allá de las cuotas de los servicios institucionales ya contratados.

## Etapa de autenticación

Prueba REST reportada por Salud: HTTP 200. Se añade SparkAuth.gs como componente aislado y aún no enrutable: accounts:lookup verifica la identidad con Firebase, y la API oficial verifyAppCheckToken verifica y consume tokens de uso limitado. Requiere comprobar el permiso IAM firebaseappcheck.appCheckTokens.verify y un scope OAuth admitido (firebase o cloud-platform). El cliente futuro deberá solicitar getLimitedUseToken para cada llamada y no reutilizar tokens consumidos. La API key de Firebase web se configura como FIREBASE_WEB_API_KEY en Script Properties; no introducir claves HMAC en el frontend. Revisar dominios autorizados de Auth y clave reCAPTCHA para adminterritorial-bit.github.io si se utiliza Pages. Todavía no se ha probado la verificación de tokens reales ni el transporte navegador–Apps Script; no activar operaciones de expedientes hasta completar pruebas.

### Diagnóstico OAuth

La prueba institucional devolvió HTTP 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT. El manifiesto Spark utiliza cloud-platform, alternativa oficialmente admitida por verifyAppCheckToken. Guardar y volver a autorizar con Salud; comprobar que el token nuevo incluya el alcance. Este alcance no concede roles IAM por sí mismo ni activa facturación. Si persiste, revisar consentimiento y restricciones de Workspace; si falta firebaseappcheck.appCheckTokens.verify, revisar IAM. El rechazo intencional de un token inválido no acredita todavía que un token genuino sea aceptado.

### Proyecto consumidor de App Check

El segundo diagnóstico reportó SERVICE_DISABLED en 983102853857 (proyecto consumidor del OAuth de Apps Script), no en el proyecto institucional 91732599743. Se especifica x-goog-user-project: tramite-discapacidad en ambas llamadas a verifyAppCheckToken para probar el proyecto consumidor correcto sin vincular ni modificar el proyecto predeterminado. Requiere API habilitada en el proyecto institucional y permiso serviceusage.services.use. Mantener Spark; no activar facturación. Pendiente prueba real.

## Diagnóstico de tokens auténticos
El 403 Firebase App Check token is invalid confirma que el token falso fue rechazado sin error de IAM. La página aislada spark-probe.html inicia sesión con Salud y obtiene un token de uso limitado; no muestra ni conserva credenciales. Copiar ReceptionProbe.gs reemplazando solo Código.gs de Recepción (conservar SparkAuth.gs y Firestore.gs), actualizar la implementación existente, no crear URL nueva. La prueba devuelve solamente resultado lógico y rol, y no modifica Firestore, Drive ni correo. La URL original se verifica mediante una huella SHA-256 antes de enviar tokens por POST. El portal principal permanece local/demo. Quitar el diagnóstico tras validar. Pendiente ejecución real y comprobación de CI.
