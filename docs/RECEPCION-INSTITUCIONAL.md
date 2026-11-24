# Recepción electrónica — versión para puesta en servicio

Este release elimina los cuatro indicadores de aprobación no operativos que habían impedido abrir la recepción. La disponibilidad de `/exec?content=official-intake` depende ahora del acceso técnico a Firestore y a la carpeta privada de Drive configurada por `ROOT_FOLDER_ID`.

Los avisos de recepción, privacidad, condiciones y datos sensibles se incluyen en código con versión, hash e información visible al ciudadano. Los textos institucionales publicados en el panel jurídico sustituyen automáticamente el texto base cuando están vigentes; el responsable de Salud/Jurídica debe revisarlos y aprobarlos conforme a su procedimiento. Las decisiones se almacenan con versión, hash y cuenta autenticada. No se afirma que esta referencia de seguimiento sea radicado oficial ni certificado.

## Despliegue

1. En el proyecto **DISCAPACIDAD - Recepción**, actualizar solo `Codigo.gs` con `apps-script/spark/UnifiedBackend.gs` sin duplicar `SparkAuth.gs` ni `ServiceCatalog.gs`. Guardar.
2. **Implementar → Administrar implementaciones → editar la aplicación web actual → Nueva versión → Implementar**. Mantener la misma URL `/exec`.
3. Consultar `/exec?content=official-intake`, confirmar `enabled:true` y cuatro `documents`.
4. Validar el ingreso de un ciudadano con Google, subir un PDF de prueba sin datos clínicos, comprobar el expediente en Drive privado, la referencia, Firestore `officialRequests`, el acuse y la bandeja del supervisor.
5. Antes de invitar a usuarios reales, confirmar que se han aprobado los textos y que existen condiciones efectivas de custodia, seguridad documental, respuesta y atención. Este paso es de responsabilidad institucional y no lo verifica una prueba automatizada.

La propiedad `SITS_HEALTH_CASE_OFFICERS` es opcional: si está configurada, restringe el acceso al listado autorizado de UID; si no existe, el acceso a la bandeja queda limitado al rol `supervisor` validado en Firebase. No establecer referencias de aprobación simuladas. `SPARK_PILOT_ENABLED=false` desactiva el circuito antiguo de expedientes sintéticos sin impedir sesiones ni recepción real.

Los soportes se limitan a PDF de hasta 4,5 MB por archivo y 7 MB en total. Los nombres, contenido, hashes, rastro de auditoría y política privada de Drive deben ser evaluados en operación. No habilitar accesos públicos a Drive.
