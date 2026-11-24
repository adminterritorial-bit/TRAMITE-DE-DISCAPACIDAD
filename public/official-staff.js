// Gestión institucional: expedientes reales, custodia y entrega de certificados.
const STATES={
 saving:'Guardando documentos',storage_review:'Verificación de almacenamiento',received:'Recibida',
 reviewing:'En revisión',needs_documents:'Subsanación requerida',
 awaiting_certificate:'Pendiente de certificado',sending:'Preparando entrega',
 available:'Certificado disponible',delivered:'Certificado enviado',
 delivery_review:'Envío por verificar',not_proceed:'No procede',closed:'Archivada'
};
const NEXT={
 received:['reviewing'],reviewing:['needs_documents','awaiting_certificate','not_proceed'],
 needs_documents:['reviewing'],awaiting_certificate:['reviewing','not_proceed'],
 delivered:['closed'],available:['closed'],not_proceed:['closed']
};
const NAMES={historia:'Soporte médico',apoyo:'Soporte adicional',certificate:'Certificado de discapacidad'};
const safeDate=ms=>ms?new Date(ms).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'—';
const e=(tag,txt,cls)=>{const x=document.createElement(tag);if(txt!==undefined)x.textContent=txt;if(cls)x.className=cls;return x};
const b=(txt,fn,cls='secondary')=>{const x=e('button',txt,cls);x.type='button';x.addEventListener('click',fn);return x};
const field=(title,control)=>{const label=e('label',undefined,'case-field');label.append(e('span',title),control);return label};
const errorText=err=>{
 const code=err?.message||'operation_failed';
 const messages={
  firestore_permission_denied:'Firestore no autorizó guardar el cambio. Revisa el acceso del proyecto de Apps Script a la base de datos.',
  firestore_precondition:'Firestore rechazó la operación o requiere un índice. Consulta las ejecuciones del proyecto Apps Script.',
  firestore_unavailable:'No fue posible guardar la actuación en Firestore. El estado anterior se conserva hasta verificar la operación.',
  content_version_changed:'El expediente fue actualizado por otra persona. Recarga el registro antes de continuar.',
  invalid_transition:'La operación no corresponde al estado actual. Actualiza el expediente.',
  recent_login_required:'Para esta actuación debes salir e ingresar nuevamente con Google.',
  delivery_uncertain:'No se ha podido confirmar que el correo haya sido entregado. Consulta la bitácora antes de repetir cualquier envío.',
  invalid_fixture:'El PDF no cumple los requisitos de integridad, formato o tamaño.',
  forbidden:'Tu cuenta no tiene autorización para esta actuación.',
  rate_limit:'Se alcanzó el límite de operaciones de seguridad. Consulta con el administrador.',
  invalid_request:'El servidor no reconoce la operación o faltan datos. Comprueba que el código de Apps Script esté actualizado.'
 };
 return (messages[code]||'No se completó la operación. Consulta el registro y vuelve a cargar.')+' · '+code;
};
function pill(status){
 const x=e('span',STATES[status]||'Estado por verificar','case-badge');
 x.dataset.status=status||'unknown';return x;
}
function download(blob,name){
 const bytes=Uint8Array.from(atob(blob.base64),x=>x.charCodeAt(0));
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
 const link=e('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function renderOfficialStaffInbox({invoke,validatePdf}){
 const dashboard=document.getElementById('adminDashboard');
 if(!dashboard||dashboard.classList.contains('hidden'))return;
 let panel=dashboard.querySelector('#officialInbox');
 if(!panel){
  panel=e('section',undefined,'official-inbox');
  panel.id='officialInbox';
  dashboard.querySelector('.dashbar')?.after(panel);
 }
 panel.hidden=false;panel.setAttribute('aria-label','Gestión de expedientes de Salud');
 const head=e('div',undefined,'case-heading'),intro=e('div');
 intro.append(e('span','SECRETARÍA DE SALUD · GESTIÓN DOCUMENTAL','intake-kicker'),
   e('h2','Gestión integral de expedientes'),
   e('p','Revisa soportes, registra actuaciones, solicita correcciones y entrega certificados desde el expediente.'));
 const refresh=b('Actualizar bandeja',()=>load(),'secondary');
 head.append(intro,refresh);
 const status=e('p','','case-feedback');status.setAttribute('role','status');
 const counts=e('div',undefined,'case-counts');
 const tools=e('div',undefined,'case-tools');
 const search=e('input');search.type='search';search.placeholder='Nombre o referencia';search.setAttribute('aria-label','Buscar por nombre o referencia');
 const filter=e('select');filter.setAttribute('aria-label','Filtrar por estado');
 for(const [value,name] of [['','Todos los estados'],...Object.entries(STATES)]){
  const o=e('option',name);o.value=value;filter.append(o);
 }
 tools.append(field('Buscar expediente',search),field('Estado',filter));
 const layout=e('div',undefined,'case-layout'),list=e('div',undefined,'case-list'),detail=e('div',undefined,'case-detail');
 list.setAttribute('aria-label','Lista de expedientes');
 detail.setAttribute('aria-label','Expediente seleccionado');
 detail.append(e('h3','Selecciona un expediente'),e('p','Consulta los soportes y su historial de gestión.'));
 layout.append(list,detail);panel.replaceChildren(head,status,counts,tools,layout);
 let records=[],selectedId=null,selectedDetail=null;
 const signal=(message,problem=false)=>{status.textContent=message;status.dataset.error=String(problem)};
 function stat(name,count,kind){
  const item=e('div',undefined,'case-stat'),num=e('strong',String(count));
  item.append(num,e('span',name));item.dataset.kind=kind;return item;
 }
 function drawCounts(){
  counts.replaceChildren(
   stat('Solicitudes',records.length,'all'),
   stat('Recibidas',records.filter(x=>x.status==='received').length,'received'),
   stat('En revisión',records.filter(x=>x.status==='reviewing').length,'reviewing'),
   stat('Subsanaciones',records.filter(x=>x.status==='needs_documents').length,'needs_documents'),
   stat('Pendientes de certificado',records.filter(x=>x.status==='awaiting_certificate').length,'awaiting_certificate'),
   stat('Entregadas',records.filter(x=>['delivered','available'].includes(x.status)).length,'delivered')
  );
 }
 function drawList(){
  list.replaceChildren();const term=search.value.trim().toLocaleLowerCase('es-CO');
  const filtered=records.filter(x=>(!filter.value||filter.value===x.status)&&
    (!term||(x.reference+' '+x.name).toLocaleLowerCase('es-CO').includes(term)));
  for(const item of filtered){
   const card=b('',()=>openCase(item.id),'case-list-card');
   card.setAttribute('aria-label','Gestionar '+item.reference);
   card.classList.toggle('selected',selectedId===item.id);
   card.append(e('strong',item.reference),pill(item.status),e('span',item.name||'Titular'),e('small',safeDate(item.createdAt)));
   list.append(card);
  }
  if(!filtered.length)list.append(e('p','Sin expedientes con los criterios seleccionados.','muted'));
 }
 async function load(reopen){
  refresh.disabled=true;signal('Consultando expedientes…');
  try{
   const response=await invoke('officialInbox');
   records=Array.isArray(response.items)?response.items:[];
   drawCounts();drawList();signal('Bandeja actualizada');
   if(reopen&&records.some(x=>x.id===reopen))await openCase(reopen);
  }catch(err){signal(errorText(err),true);}
  finally{refresh.disabled=false;}
 }
 search.addEventListener('input',drawList);filter.addEventListener('change',drawList);
 async function openCase(id){
  selectedId=id;drawList();detail.replaceChildren(e('p','Consultando expediente…','muted'));
  try{
   const row=await invoke('officialRead',{id});
   if(selectedId!==id)return;
   selectedDetail=row;renderDetail(row);
  }catch(err){detail.replaceChildren(e('p',errorText(err),'error'));}
 }
 function actionBlock(label,description){
  const section=e('section',undefined,'case-section');
  section.append(e('h4',label),e('p',description,'case-section-help'));return section;
 }
 function renderDetail(row){
  const title=e('div',undefined,'case-detail-heading'),left=e('div');
  left.append(e('span','EXPEDIENTE · '+row.reference,'intake-kicker'),e('h3',row.name),e('p',row.documentType+' '+row.documentNumber+' · '+row.zone));
  title.append(left,pill(row.status));
  const info=e('div',undefined,'case-facts');
  for(const [label,value] of [['Correo verificado',row.email],['Teléfono',row.phone||'Sin registrar'],
    ['Presentación',row.representation==='apoyo'?'Persona de apoyo':'Directa'],['Última actualización',safeDate(row.updatedAt)]]){
   const pair=e('div');pair.append(e('small',label),e('strong',value||'—'));info.append(pair);
  }
  detail.replaceChildren(title,info);
  const documents=actionBlock('Documentos del expediente','Los soportes se conservan en el repositorio privado; no se generan enlaces públicos.');
  const filelist=e('div',undefined,'case-filelist');
  for(const file of row.files||[]){
   const line=e('div',undefined,'case-document');line.append(e('span',NAMES[file.kind]||'Documento'),e('small',(file.size/1024/1024).toFixed(2)+' MB'));
   const action=b('Descargar PDF',async()=>{
    action.disabled=true;signal('Preparando descarga…');
    try{download(await invoke('officialDownload',{id:row.id,kind:file.kind}),file.kind+'-'+row.reference+'.pdf');signal('Descarga iniciada');}
    catch(err){signal(errorText(err),true);}
    finally{action.disabled=false;}
   },'secondary');line.append(action);filelist.append(line);
  }
  if(row.certificate){
   const line=e('div',undefined,'case-document');
   line.append(e('span','Certificado incorporado'),e('small',(row.certificate.size/1024/1024).toFixed(2)+' MB'));
   const dl=b('Descargar certificado',async()=>{
    dl.disabled=true;
    try{download(await invoke('officialDownload',{id:row.id,kind:'certificate'}),'Certificado-'+row.reference+'.pdf');signal('Descarga iniciada');}
    catch(err){signal(errorText(err),true);}finally{dl.disabled=false;}
   });line.append(dl);filelist.append(line);
  }
  if(!filelist.children.length)filelist.append(e('p','No hay soportes asociados.','muted'));
  documents.append(filelist);detail.append(documents);
  const history=actionBlock('Historial de actuaciones','Registro cronológico de las decisiones y novedades del expediente.');
  const timeline=e('ol',undefined,'case-timeline');
  const events=Array.isArray(row.history)?row.history:[];
  for(const item of [...events].reverse()){
   const li=e('li');li.append(pill(item.status),e('small',safeDate(item.at)),e('p',item.comment||'Actualización del expediente'));timeline.append(li);
  }
  if(!events.length)timeline.append(e('li','Sin actuaciones registradas.'));
  history.append(timeline);detail.append(history);
  const options=NEXT[row.status]||[];
  if(options.length){
   const block=actionBlock('Actualizar estado','Selecciona la siguiente actuación y registra el motivo para mantener la trazabilidad.');
   const form=e('form',undefined,'case-update-form');
   const select=e('select');select.required=true;select.name='status';select.setAttribute('aria-label','Nuevo estado');
   for(const code of options){const option=e('option',STATES[code]||code);option.value=code;select.append(option);}
   const kind=e('select');kind.setAttribute('aria-label','Soporte requerido');
   for(const [value,label] of [['historia','Historia clínica o soporte médico'],['apoyo','Soporte adicional']]){
    const opt=e('option',label);opt.value=value;kind.append(opt);
   }
   const kindLabel=field('Documento que debe corregirse',kind);
   const comments=e('textarea');comments.required=true;comments.maxLength=450;comments.rows=3;comments.placeholder='Motivo de la decisión y orientaciones para el ciudadano';
   const confirm=b('Registrar actuación',async()=>{
    if(!form.reportValidity()||!comments.value.trim())return;
    confirm.disabled=true;signal('Registrando actuación…');
    try{
     await invoke('officialTransition',{id:row.id,revision:row.revision,status:select.value,comment:comments.value.trim(),
      ...(select.value==='needs_documents'?{documentKind:kind.value}:{})});
     signal('Actuación registrada correctamente');await load(row.id);
    }catch(err){signal(errorText(err),true);}finally{confirm.disabled=false;}
   },'primary');
   const update=()=>{kindLabel.hidden=select.value!=='needs_documents';};
   select.addEventListener('change',update);update();
   form.append(field('Nuevo estado',select),kindLabel,field('Justificación de la actuación',comments),confirm);
   block.append(form);detail.append(block);
  }
  if(row.status==='awaiting_certificate'){
   const block=actionBlock('Certificado de discapacidad','Adjunta exclusivamente el certificado expedido por la autoridad competente. Tras confirmar, el sistema lo guardará y realizará la entrega autorizada.');
   const destination=e('div',undefined,'case-delivery-destination');
   destination.append(e('strong',row.certificateEmailConsent?'Entrega por correo autorizada':'Entrega disponible en el portal'),
    e('span',row.certificateEmailConsent
     ?'Se enviará automáticamente como PDF al correo verificado: '+row.email
     :'El titular no autorizó recibir el PDF por correo. El archivo quedará disponible mediante su cuenta autenticada.'));
   const file=e('input');file.type='file';file.accept='.pdf,application/pdf';file.required=true;file.setAttribute('aria-label','Adjuntar certificado PDF');
   const accepted=e('input');accepted.type='checkbox';accepted.required=true;
   const check=e('label',undefined,'case-confirm');check.append(accepted,e('span','Confirmo que el PDF corresponde a este titular y que ha sido emitido por la autoridad competente.'));
   const send=b('Cargar y entregar certificado',async()=>{
    if(!file.files[0]||!accepted.checked){signal('Selecciona el PDF y confirma su validez.',true);return;}
    send.disabled=true;signal('Verificando y almacenando el certificado…');
    try{
     const payload=await validatePdf(file.files[0],'certificate');
     const result=await invoke('officialSendCertificate',{id:row.id,revision:row.revision,confirm:true,file:payload});
     if(result.status==='delivered')signal('Certificado guardado y enviado al correo autorizado.');
     else if(result.status==='available')signal('Certificado guardado y disponible para el ciudadano en el portal.');
     else signal('Certificado almacenado. El envío debe verificarse antes de cualquier reintento.',true);
     await load(row.id);
    }catch(err){signal(errorText(err),true);}finally{send.disabled=false;}
   },'primary');
   block.append(destination,field('Certificado expedido (PDF, máximo 4,5 MB)',file),check,send);detail.append(block);
  }
  if(row.status==='delivery_review'){
   const block=actionBlock('Verificación de entrega','El certificado ya está guardado. No se reenviará automáticamente: primero debemos comprobar si el correo anterior fue aceptado.');
   const verify=b('Comprobar registro del envío',async()=>{
    verify.disabled=true;signal('Comprobando evidencia de entrega…');
    try{await invoke('officialVerifyDelivery',{id:row.id,revision:row.revision,confirm:true});signal('Entrega confirmada.');await load(row.id);}
    catch(err){signal(errorText(err),true);}finally{verify.disabled=false;}
   },'secondary');block.append(verify);detail.append(block);
  }
  if(row.certificateAvailable){
   const label=row.deliveryMethod==='email'?'El certificado fue enviado al correo verificado.':'El certificado está disponible para descarga autenticada.';
   const block=actionBlock('Entrega del certificado',label);block.append(pill(row.status));detail.append(block);
  }
 }
 await load();
}
