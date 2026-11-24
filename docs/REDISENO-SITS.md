# Rediseño de SITS Salud

## Arquitectura conservada

El portal permanece en HTML semántico y módulos nativos. El sistema de diseño vive en `public/design.css` y los controles reutilizables de archivos, acciones y descargas en `public/ui-components.js`. El empaquetado reúne las hojas de estilo en su orden original para mantener compatibilidad con las pantallas administrativas. Los módulos de seguimiento y bandeja se cargan al abrir sus vistas. En visita pública sin sesión, Supabase Auth se carga al pedir el ingreso. Se conserva la sesión actual del navegador; el formulario guarda sus pasos solamente en memoria.

Manrope se distribuye con SIL Open Font License. El favicon, el icono instalado y la imagen social derivan del PNG municipal previamente incluido en el repositorio. Se usa una variante WebP de la misma marca y los metadatos públicos no incluyen información de expedientes.

## Interfaz y operación

- El inicio separa orientación, catálogo, carpeta ciudadana y ayuda. El acceso de Salud conserva su propia entrada.
- El asistente conserva los campos, las autorizaciones versionadas y el contrato del servidor. Presenta cinco pasos y una revisión editable. La lectura del PDF valida su firma, tamaño y hash antes de preparar el envío. El usuario puede reemplazar o quitar archivos. La comunicación durante el envío reporta etapas. Un reintento reutiliza la clave de la misma solicitud. La constancia se genera a partir de la respuesta recibida.
- La carpeta muestra referencias, estados, última actualización, historial cronológico y la orientación registrada para subsanar. Las descargas pasan por el endpoint autenticado.
- La bandeja incluye filtros, orden, paginación, prioridades por estado y actividad reciente. Al seleccionar, carga el detalle que falte. Las actuaciones mantienen los permisos, las revisiones y la confirmación de la entrega.
- La función de lectura paginada está versionada en `20261124153702_sits_paged_case_workspaces.sql`. Se ejecuta bajo los permisos del usuario y conserva RLS. El resumen evita incluir datos de contacto, documentos o historial por cada tarjeta. El detalle autorizado continúa en Apps Script. El índice compuesto por fecha e ID soporta los órdenes de las dos listas. Las descargas y las referencias privadas permanecen en Drive, y MailApp mantiene las reglas de entrega.
- La vista previa puede leer el endpoint estable. Mientras el endpoint nuevo se valida, usa su respuesta anterior y presenta el subconjunto cargado, con el filtro de responsable deshabilitado. El cálculo global, la paginación y el indicador exacto de recepción se activan con la migración y el adaptador nuevos. Ninguna configuración de producción forma parte de este cambio de rama.

## Referentes y alcance normativo

| Referente | Patrón aplicado |
| --- | --- |
| [GOV.CO Kit UI](https://cdn.www.gov.co/v5/) y [guía de cabecera](https://cdn.www.gov.co/v4/) | Marca y entidad responsables, navegación con nombres breves y acceso a las políticas institucionales. La marca usada proviene del activo municipal. |
| [GOV.UK Design System](https://design-system.service.gov.uk/) y [revisión de respuestas](https://design-system.service.gov.uk/patterns/check-answers/) | Resumen editable antes de enviar, errores junto a los campos y resumen que lleva al control correspondiente. |
| [U.S. Web Design System](https://designsystem.digital.gov/components/step-indicator/) | Paso actual anunciado y diferenciado con texto, progreso y encabezado específico por pantalla. |
| [Service NSW](https://www.service.nsw.gov.au/) | Servicios públicos localizables antes de identificarse y acceso a las gestiones personales desde una entrada separada. |
| [Mi Carpeta Ciudadana](https://masinformacioncarpeta.carpetaciudadana.gob.es/infocc/masInformacion/mis-expedientes) | Expedientes agrupados por estado y detalle accesible desde la referencia. |

La [Resolución MinTIC 2893 de 2020](https://normograma.mintic.gov.co/mintic/compilacion/docs/resolucion_mintic_2893_2020.htm) y sus anexos orientan las sedes electrónicas, la estandarización de trámites y su integración con GOV.CO según alcance. El [Decreto 088 de 2022](https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=175866) fija condiciones para digitalizar trámites de las autoridades. La [Resolución 1519 de 2020, artículo 3 y Anexo 1](https://normograma.mintic.gov.co/mintic/compilacion/docs/resolucion_mintic_1519_2020.htm) establece WCAG 2.1 AA. El objetivo adicional de este proyecto es WCAG 2.2 AA. La revisión automatizada cubre un subconjunto de los requisitos. La validez del trámite se rige por el procedimiento y las entidades competentes. La gratuidad y el término mostrado en su ficha se refieren a la [Resolución 1197 de 2024, parágrafo 1 y artículo 10](https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/DIJ/resolucion-1197-de-2024.pdf).

## Verificación y dependencias

- Pruebas base: `node --test tests/*.test.mjs`.
- Flujos de formulario, recuperación tras error, archivo ficticio, accesibilidad y navegación: las pruebas Playwright de CI sirven `public` en localhost:8080. Los documentos de prueba están en `public/pilot-fixtures`.
- Contrato de filtros, conteos y RLS: `supabase/tests/paged-workspaces.sql` sobre una base desechable con las migraciones aplicadas. Se hace rollback al final.
- La autenticación real en la vista previa requiere que su origen esté autorizado en el cliente web de Google. Las pruebas de Drive y MailApp requieren una ejecución aislada y documentos ficticios. La migración SQL aditiva y el adaptador de Apps Script esperan esas comprobaciones.
- El cliente publicado usa Supabase. La configuración archivada de Firebase, los scripts anteriores y las ramas de compatibilidad del backend se conservan como referencia histórica. La nueva lectura no los invoca.
