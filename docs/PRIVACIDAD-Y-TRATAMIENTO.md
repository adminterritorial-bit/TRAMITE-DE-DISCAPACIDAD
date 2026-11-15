# Privacidad y tratamiento de datos

## Estado del contenido

Los textos base de la sección Centro legal describen el piloto y están identificados como materiales en revisión. Jurídica y la función de protección de datos deben validar finalidad, base jurídica, responsables, canales, plazos, menores y representación, encargados, transmisiones, custodia, TRD y procedimiento de supresión. Salud, TIC y Archivo aportan las validaciones de su competencia. Los borradores y sus historiales quedan privados.

El administrador o supervisor guarda un borrador. Un revisor expresamente habilitado por su UID en `LEGAL_REVIEWERS`, distinto de su autor y con sesión institucional reciente, registra la referencia a la decisión documentada y su fecha de vigencia. El publicador actúa a partir de esa revisión y al llegar la vigencia. Crear o editar genera otra versión con hash SHA-256 de tipo, título y contenido UTF-8. Retirar desactiva la proyección pública y conserva la bitácora.

## Decisiones y evidencia

Para el piloto se registran el conocimiento del aviso, la aceptación de las condiciones de prueba y la decisión positiva o negativa de recibir comunicaciones electrónicas. Las casillas comienzan desmarcadas. La última opción es voluntaria. Una negativa conserva el acceso al seguimiento. Si el titular deja la opción vacía, el correo queda desactivado y la aplicación registra únicamente los actos obligatorios que ocurrieron. El servidor verifica versión, hash y tipo de acto y escribe pruebas inmutables con el UID, trámite, finalidad, expediente y timestamp del servidor en el mismo commit que crea el registro. Un cambio concurrente en la política invalida la escritura. El titular puede consultar y exportar únicamente sus evidencias.

El tratamiento sensible está inhabilitado. Una futura modalidad requiere fundamentación validada y, cuando corresponda, autorización previa, expresa y separada, con alcance y finalidad. La autorización para comunicaciones de la prueba no representa autorización de datos sensibles ni notificación administrativa.

El recorrido del navegador verifica las casillas inicialmente desmarcadas, la decisión voluntaria omitida, la versión remitida al servidor y la descarga de la constancia. La prueba sustituye Firebase Authentication y el transporte de Apps Script por dobles controlados.

## Titulares y almacenamiento

El portal admite solicitudes sintéticas de acceso, actualización, rectificación, supresión, prueba de autorización y revocación sin campos libres para datos del solicitante. El responsable asignado en `DATA_RIGHTS_OFFICERS` reclama y responde el caso con trazabilidad. `RIGHTS_DUE_CALENDAR_DAYS` es opcional y corresponde a una meta operativa validada institucionalmente. Los términos legales, ajustes, verificaciones, ampliaciones y vencimientos de una petición real se gestionan por los canales oficiales. No se elimina documentación de manera automática.

La demo conserva solicitudes en memoria. El portal guarda una marca de sesión por aviso mostrado y usa persistencia de sesión de Firebase Authentication, además de reCAPTCHA Enterprise para App Check. No incorpora analítica, cookies opcionales ni almacenamiento web de adjuntos. El archivo documental se custodia en Drive privado. La autorización para enviar correo no se usa para cargar medición opcional.

Fuentes para revisión [Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981) · [Decreto 1074 de 2015, capítulo 25](https://cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr025.htm) · [Resolución 1519 de 2020](https://normograma.mintic.gov.co/mintic/compilacion/docs/resolucion_mintic_1519_2020.htm).
