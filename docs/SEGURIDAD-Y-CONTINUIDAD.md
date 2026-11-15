# Seguridad, continuidad y operación

## Inventario y riesgo

| Activo y clasificación | Amenaza | Control verificable | Riesgo pendiente y responsable |
| --- | --- | --- | --- |
| Original municipal y archivos estáticos, públicos | Insignia improcedente o modificada | SHA-256, entrega de bytes originales, exclusión de la segunda marca en CI | Aprobación del uso según MIV, Comunicaciones |
| Firestore, restringido | Lecturas directas, acceso por expediente ajeno, escritura concurrente | Reglas fail-closed, verificación Auth/App Check, autorización de titular y controles REST de versión | IAM, verificación de índices y MFA en el entorno, TIC |
| Expedientes Drive, restringidos en piloto | Enlace público, fuga, archivo malicioso | Carpeta individual, verificación de acceso privado, hash y archivo ficticio permitido | Herencia, TRD, análisis antimalware y restauración, Salud y Archivo |
| Avisos y documentos con borradores privados | XSS, publicación prematura, propagación de información de expedientes | Texto plano, proyección pública acotada, caducidad, revisión independiente de políticas | Moderación, aprobación formal y cuotas, Comunicaciones y Jurídica |
| Evidencias y solicitudes de titulares, restringidas | Cuentas ajenas, alteración de decisiones | Solo UID propietario, responsables asignados, precondiciones y registro append-only de aplicación | Custodio, retención, términos de atención y evidencias auditadas, Protección de Datos |
| Correo institucional, restringido | Entrega indebida o duplicada | Destinatario del expediente verificado, mensajes sin adjuntos de salud, decisión de correo, registro durable de intento | Cuotas y conciliación por Salud |
| GitHub Actions y Apps Script | Cambios no autorizados o reversión incompleta | Pruebas, SHA de artefacto y control de versiones de la implementación existente | Revisión de accesos, inventario de credenciales y procedimiento de rollback, TIC |

## Despliegue y reversión en Spark

1. Ejecutar `node scripts/prepare-spark.mjs` y conservar las huellas del artefacto. Usar el proyecto de Recepción y su implementación existente. El paquete contiene `Codigo.gs` y el manifiesto. Reemplazar juntos los archivos de código activos del backend unificado que el paquete contiene y retirar sus copias duplicadas del editor. Conservar propiedades, versión anterior y permisos previos con una copia protegida.
2. Crear los índices definidos en `firestore.indexes.json` con una identidad autorizada, validando también los índices anteriores. Configurar exclusivamente UID de revisores y responsables autorizados. No publicar políticas sin sus decisiones formalizadas.
3. Publicar una versión en la implementación existente, conservar URL y comprobar un GET de salud sin datos privados. Probar sesión, proyección pública, publicación y retiro, documentos de prueba y correo de cuentas habilitadas.
4. Ante fallo, revertir a la versión anterior desde Administrar implementaciones. Revisar cambios en Firestore antes de reintentar. Los módulos nuevos requieren la versión ampliada. El piloto anterior conserva su flujo sintético hasta la actualización.

## Respaldo y recuperación

La custodia de Salud y Archivo debe aprobar periodicidad, retención, ubicación y cuentas. Exportar inventarios, metadatos y bitácoras por identificador interno con una identidad restringida y guardar los respaldos cifrados en un destino institucional de acceso individual. Copiar los PDF dentro del almacenamiento autorizado junto con un índice de hash, tamaño y expediente. Mantener versiones y referencias de configuración fuera del repositorio. No incluir tokens en exportaciones. Guardar el respaldo de código como artefacto con SHA.

En un entorno aislado, recuperar primero registros y luego archivos, verificar hashes y pertenencia de carpeta, ejecutar las pruebas de acceso como titular y tercero, y conservar acta de recuperación con tiempos observados. Si un envío quedó ambiguo, revisar el expediente y el registro antes de cualquier reintento. Medir el punto y tiempo de recuperación en el primer ejercicio institucional. Spark conserva el respaldo lógico bajo custodia institucional, sin activar capacidades de pago.

## Incidentes

Salud y TIC aíslan el flujo afectado, preservan bitácoras sin copiar contenido clínico a herramientas públicas, verifican accesos y revocan sesiones o permisos comprometidos. Protección de Datos clasifica el alcance, coordina notificaciones conforme al régimen aplicable y registra decisiones. Archivo valida integridad y conservación. Tras restaurar desde la última versión segura, repetir aislamiento entre titulares, permisos, correo y recuperación antes de reabrir. Mantener el piloto sintético durante las pruebas.

[Resolución 500 de 2021](https://normograma.mintic.gov.co/mintic/compilacion/docs/resolucion_mintic_0500_2021.htm) · [Resolución 2277 de 2025](https://normograma.mintic.gov.co/mintic/compilacion/docs/resolucion_mintic_2277_2025.htm) · [Acuerdo AGN 001 de 2024](https://cancilleria.gov.co/sites/default/files/Normograma/docs/acuerdo_archivo_0001_2024.htm)
