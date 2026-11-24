// Common five-stage citizen intake contract, shared by official disability
// and services designed in SITS Salud. This is presentation/readiness metadata,
// NOT permission to accept real applications.
export const CITIZEN_INTAKE_STAGES=Object.freeze([
 {id:'identity',title:'Identificación',description:'Datos de la persona solicitante'},
 {id:'service',title:'Información del trámite',description:'Contacto y preguntas del servicio'},
 {id:'documents',title:'Documentos',description:'Soportes requeridos y opcionales'},
 {id:'consent',title:'Autorizaciones',description:'Tratamiento de datos y condiciones vigentes'},
 {id:'review',title:'Revisión y envío',description:'Comprobar información antes de radicar'}
]);
const DOC_KINDS=new Set(['historia','apoyo']);
export function inspectConfiguredIntake(schema){
 const warnings=[],fields=Array.isArray(schema?.fields)?schema.fields:[],
       documents=fields.filter(field=>field?.type==='document'),
       extra=fields.filter(field=>field?.type!=='document');
 if(!schema||!schema.title||!schema.category||!schema.channel)warnings.push('Completar nombre, categoría y canal autorizado.');
 if(!Array.isArray(schema?.states)||schema.states[0]?.id!=='received'||!schema.states.some(s=>s.id==='closed'))
  warnings.push('Definir un flujo de estados válido con recepción y cierre.');
 if(fields.length>16)warnings.push('El formulario supera el límite de 16 preguntas del backend actual.');
 if(documents.length>2||documents.some(field=>!DOC_KINDS.has(field.fixture)))
  warnings.push('Revisar el número y tipo de soportes compatibles con el almacenamiento actual.');
 if(documents.length&&!documents.some(field=>field.fixture==='historia'&&field.required))
  warnings.push('Si el trámite requiere PDFs, configurar un soporte principal obligatorio antes de habilitar el circuito actual.');
 if(fields.some(field=>!field.id||!field.label))warnings.push('Completar la etiqueta y código de cada pregunta.');
 return {
  stages:CITIZEN_INTAKE_STAGES.map(stage=>({
   ...stage,questions:stage.id==='service'?extra:
          stage.id==='documents'?documents:[]
  })),
  compatible:!warnings.length,
  warnings,
  operational:false,
  explanation:'Una ficha publicada no habilita la recepción ciudadana. Se requieren pruebas reales, autorización de Salud y una versión sincronizada de Apps Script.'
 };
}
