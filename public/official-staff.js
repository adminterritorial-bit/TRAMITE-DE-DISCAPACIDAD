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
 needs_documents:['reviewing'],not_proceed:['closed']
};
const workspaces=new WeakMap();
const localDate=stamp=>{
 const value=new Date(stamp).getTime();
 return Number.isFinite(value)?new Date(value-5*3600000).toISOString().slice(0,10):'';
};
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const NAMES={historia:'Soporte médico',apoyo:'Soporte adicional',certificate:'Certificado de discapacidad'};
const safeDate=ms=>ms?new Date(ms).toLocaleString('es-CO',{dateStyle:'medium',timeStyle:'short'}):'—';
const e=(tag,txt,cls)=>{const x=document.createElement(tag);if(txt!==undefined)x.textContent=txt;if(cls)x.className=cls;return x};
const b=(txt,fn,cls='secondary')=>{const x=e('button',txt,cls);x.type='button';x.addEventListener('click',fn);return x};
const field=(title,control)=>{const label=e('label',undefined,'case-field');label.append(e('span',title),control);return label};
const errorText=err=>{
 const code=err?.code||err?.message||'operation_failed';
 const messages={
  database_unavailable:'No fue posible guardar la actuación en Supabase.',
  revision_conflict:'El expediente cambió durante la operación. Actualiza el registro.',
  content_version_changed:'El expediente fue actualizado por otra persona. Recarga el registro antes de continuar.',
  invalid_transition:'La operación no corresponde al estado actual. Actualiza el expediente.',
  recent_login_required:'Para esta actuación debes salir e ingresar nuevamente con Google.',
  delivery_uncertain:'No se ha podido confirmar que el correo haya sido entregado. Consulta la bitácora antes de repetir cualquier envío.',
  invalid_fixture:'El PDF no cumple los requisitos de integridad, formato o tamaño.',
  forbidden:'Tu cuenta no tiene autorización para esta actuación.',
  rate_limit:'Se alcanzó el límite de operaciones de seguridad. Consulta con el administrador.',
  invalid_request:'El servidor no reconoce la operación o faltan datos. Comprueba que el código de Apps Script esté actualizado.'
 };
 return messages[code]||'No se completó la operación. Actualiza el expediente e inténtalo de nuevo.';
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
export async function renderOfficialStaffInbox({invoke,validatePdf,sessionUserId}){
 const dashboard=document.getElementById('adminDashboard');
 if(!dashboard||dashboard.classList.contains('hidden'))return;
 let panel=dashboard.querySelector('#officialInbox');
 if(!panel){
  panel=e('section',undefined,'official-inbox');
  panel.id='officialInbox';
  dashboard.querySelector('.dashbar')?.after(panel);
 }
 if(workspaces.has(panel))return;
 panel.hidden=false;panel.setAttribute('aria-label','Gestión de expedientes de Salud');
 const head=e('div',undefined,'case-heading'),intro=e('div');
 intro.append(e('span','SECRETARÍA DE SALUD · GESTIÓN DOCUMENTAL','intake-kicker'),
   e('h2','Gestión integral de expedientes'),
   e('p','Revisa soportes, registra actuaciones y entrega certificados desde el expediente.'));
 const refresh=b('Actualizar bandeja',()=>load(),'secondary');
 head.append(intro,refresh);
 const status=e('p','','case-feedback');status.setAttribute('role','status');
 const counts=e('div',undefined,'case-counts');
 const tools=e('div',undefined,'case-tools');
 const search=e('input');search.type='search';search.placeholder='Nombre, documento o radicado';search.setAttribute('aria-label','Buscar por nombre, documento o radicado');
 const filter=e('select');filter.setAttribute('aria-label','Filtrar por estado');
 for(const [value,name] of [['','Todos los estados'],...Object.entries(STATES)]){
  const o=e('option',name);o.value=value;filter.append(o);
 }
 const from=e('input');from.type='date';
 const to=e('input');to.type='date';
 const owner=e('select');
 const order=e('select');
 const task=e('select');
 for(const [select,values] of [[owner,[['','Cualquier responsable'],['me','Asignados a mí'],['none','Sin asignar']]],
  [order,[['new','Más recientes'],['old','Más antiguos'],['activity','Última actuación']]],
  [task,[['','Cualquier actuación'],['pending','Requiere gestión']]]]){
  for(const [value,label] of values){const option=e('option',label);option.value=value;select.append(option);}
 }
 tools.append(field('Buscar expediente',search),field('Estado',filter),field('Desde',from),field('Hasta',to),field('Responsable',owner),field('Orden',order),field('Prioridad',task));
 const activity=e('section',undefined,'case-activity');
 const tasks=e('section',undefined,'case-priorities');
 const overview=e('div',undefined,'case-overview');overview.append(tasks,activity);
 const layout=e('div',undefined,'case-layout'),list=e('div',undefined,'case-list'),detail=e('div',undefined,'case-detail');
 const pagination=e('div',undefined,'case-pagination'),queue=e('div',undefined,'case-queue');
 list.setAttribute('aria-label','Lista de expedientes');
 detail.setAttribute('aria-label','Expediente seleccionado');
 detail.append(e('h3','Selecciona un expediente'),e('p','Consulta los soportes y registra actuaciones en el mismo lugar.'));
 queue.append(list,pagination);
 layout.append(queue,detail);panel.replaceChildren(head,status,counts,overview,tools,layout);
 workspaces.set(panel,true);
 const limit=15;
 let records=[],selectedId=null,page=1,total=0,exact=false,metrics=null,recent=[],requestGeneration=0,detailGeneration=0,searchTimer;
 const priorities=['received','needs_documents','awaiting_certificate','delivery_review'];
 const signal=(message,problem=false)=>{status.textContent=message;status.dataset.error=String(problem)};
 function stat(name,count,kind){
  const item=e('div',undefined,'case-stat'),num=e('strong',String(count));
  item.append(num,e('span',name));item.dataset.kind=kind;return item;
 }
 function countOf(kind){return metrics?Number(metrics[kind]||0):records.filter(x=>x.status===kind).length;}
 function drawCounts(){
  counts.replaceChildren(
   stat(exact?'Expedientes':'Expedientes cargados',metrics?Object.values(metrics).reduce((sum,n)=>sum+Number(n),0):records.length,'all'),
   stat('Recibidas',countOf('received'),'received'),
   stat('En revisión',countOf('reviewing'),'reviewing'),
   stat('En subsanación',countOf('needs_documents'),'needs_documents'),
   stat('Por certificar',countOf('awaiting_certificate'),'awaiting_certificate'),
   stat('Entrega por verificar',countOf('delivery_review'),'delivery_review')
  );
  const priorityList=e('ul',undefined,'workspace-list');
  for(const kind of priorities){
   const count=countOf(kind);
   if(!count)continue;
   const li=e('li');li.append(b(STATES[kind]+' · '+count,()=>{filter.value=kind;changeFilters();},'quiet'));priorityList.append(li);
  }
  if(!priorityList.children.length)priorityList.append(e('li','No hay actuaciones pendientes en la bandeja.'));
  tasks.replaceChildren(e('h3','Acciones prioritarias'),priorityList);
  const activityList=e('ul',undefined,'workspace-list');
  for(const entry of recent){
   const li=e('li');li.append(e('strong',entry.reference),e('small',safeDate(entry.updatedAt)),pill(entry.status));activityList.append(li);
  }
  if(!activityList.children.length)activityList.append(e('li','Aún no hay actividad registrada.'));
  activity.replaceChildren(e('h3','Actividad reciente'),activityList);
 }
 function fallbackRows(){
  const term=normalize(search.value);
  const filtered=records.filter(x=>(!filter.value||filter.value===x.status)&&
    (!term||normalize([x.reference,x.name,x.documentNumber].join(' ')).includes(term))&&
    (!from.value||localDate(x.createdAt)>=from.value)&&(!to.value||localDate(x.createdAt)<=to.value)&&
    (!task.value||priorities.includes(x.status))&&(!owner.value||(owner.value==='none'?!x.assignedTo:x.assignedTo===sessionUserId)));
  filtered.sort((a,b)=>order.value==='activity'?new Date(b.updatedAt)-new Date(a.updatedAt):
    order.value==='old'?new Date(a.createdAt)-new Date(b.createdAt):new Date(b.createdAt)-new Date(a.createdAt));
  total=filtered.length;
  return filtered.slice((page-1)*limit,page*limit);
 }
 function drawList(){
  list.replaceChildren();
  const filtered=exact?records:fallbackRows();
  for(const item of filtered){
   const card=b('',()=>void openCase(item.id),'case-list-card');
   card.setAttribute('aria-label','Gestionar '+item.reference);
   card.setAttribute('aria-pressed',String(selectedId===item.id));
   card.classList.toggle('selected',selectedId===item.id);
   card.append(e('strong',item.reference),pill(item.status),e('span',item.name||'Titular'),e('small',safeDate(item.createdAt)));
   list.append(card);
  }
  if(!filtered.length)list.append(e('p','Sin expedientes con los criterios seleccionados.','case-empty'));
  pagination.replaceChildren();
  const last=Math.max(1,Math.ceil(total/limit));
  if(last>1){
   const prev=b('Anterior',()=>{page--;exact?void load():drawList();});
   const next=b('Siguiente',()=>{page++;exact?void load():drawList();});
   prev.disabled=page===1;next.disabled=page>=last;
   pagination.append(prev,e('span','Página '+page+' de '+last),next);
  }
 }
 async function load(){
  const run=++requestGeneration;
  refresh.disabled=true;signal('Consultando expedientes…');panel.setAttribute('aria-busy','true');
  try{
   const response=await invoke('officialInbox',{search:search.value.trim(),status:filter.value,from:from.value,to:to.value,
    owner:owner.value,sort:order.value,task:task.value,page,size:limit});
   if(run!==requestGeneration||!panel.isConnected)return;
   records=Array.isArray(response.items)?response.items:[];
   exact=Number.isInteger(response.total);total=response.total??records.length;
   owner.disabled=!exact;owner.title=exact?'':'Disponible con la bandeja paginada';
   metrics=exact?response.metrics:null;
   recent=Array.isArray(response.activity)?response.activity:[...records].sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,4);
   drawCounts();drawList();
   signal(exact?'Bandeja actualizada':records.length>=100?'Mostrando los últimos 100 expedientes disponibles.':'Bandeja actualizada');
  }catch(err){if(run===requestGeneration)signal(errorText(err),true);}
  finally{if(run===requestGeneration){refresh.disabled=false;panel.removeAttribute('aria-busy');}}
 }
 function changeFilters(){
  if(from.value&&to.value&&from.value>to.value){signal('La fecha inicial debe ser anterior a la fecha final.',true);return;}
  page=1;
  if(exact)void load();else drawList();
 }
 search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(changeFilters,225);});
 for(const input of [filter,from,to,owner,order,task])input.addEventListener('change',changeFilters);
 async function openCase(id){
  const sequence=++detailGeneration;selectedId=id;drawList();
  // The authorized inbox already includes the details needed to open a case.
  const available=records.find(item=>item.id===id);
  if(available?.email&&available?.documentNumber&&Array.isArray(available.history)){
   renderDetail(available);return;
  }
  detail.replaceChildren(e('p','Consultando expediente…','muted'));
  try{
   const row=await invoke('officialRead',{id});
   if(sequence!==detailGeneration||!panel.isConnected)return;
   renderDetail(row);
  }catch(err){if(sequence===detailGeneration)detail.replaceChildren(e('p',errorText(err),'error'));}
 }
 function applyChange(result,message){
  if(!result?.id)throw Error('content_version_changed');
  if(metrics){
   const old=records.find(item=>item.id===result.id);
   if(old&&old.status!==result.status){
    metrics[old.status]=Math.max(0,Number(metrics[old.status]||0)-1);
    metrics[result.status]=Number(metrics[result.status]||0)+1;
   }
  }
  records=records.map(item=>item.id===result.id?result:item);
  recent=[result,...recent.filter(item=>item.id!==result.id)].slice(0,4);
  if(result.id===selectedId)renderDetail(result);
  drawCounts();drawList();signal(message);
 }
 function actionBlock(label,description){
  const section=e('section',undefined,'case-section');
  section.append(e('h4',label),e('p',description,'case-section-help'));return section;
 }
 function renderDetail(row){
  const title=e('div',undefined,'case-detail-heading'),left=e('div');
  left.append(e('span','EXPEDIENTE · '+row.reference,'intake-kicker'),e('h3',row.name),e('p',row.documentType+' '+row.documentNumber+' · '+row.zone));
  title.append(left,pill(row.status));
  const openHeading=left.querySelector('h3');openHeading.tabIndex=-1;
  const info=e('div',undefined,'case-facts');
  for(const [label,value] of [['Correo verificado',row.email],['Teléfono',row.phone||'Sin registrar'],
    ['Presentación',row.representation==='apoyo'?'Persona de apoyo':'Directa'],['Última actualización',safeDate(row.updatedAt)]]){
   const pair=e('div');pair.append(e('small',label),e('strong',value||'—'));info.append(pair);
  }
  detail.replaceChildren(title,info);
  const tabs=e('nav',undefined,'case-section-nav');
  tabs.setAttribute('aria-label','Secciones del expediente');
  for(const [id,label] of [['case-files','Documentos'],['case-history','Actuaciones'],['case-next','Gestionar']]){
   const control=b(label,()=>{
    const section=detail.querySelector('#'+id);
    const heading=section?.querySelector('h4');
    if(heading){heading.tabIndex=-1;heading.focus();}
   },'quiet');
   control.dataset.section=id;tabs.append(control);
  }
  title.after(tabs);
  const documents=actionBlock('Documentos del expediente','Los soportes se conservan en el repositorio privado; no se generan enlaces públicos.');
  documents.id='case-files';
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
  history.id='case-history';
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
   block.id='case-next';
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
     const updated=await invoke('officialTransition',{id:row.id,revision:row.revision,status:select.value,comment:comments.value.trim(),
      ...(select.value==='needs_documents'?{documentKind:kind.value}:{})});
     applyChange(updated,'Actuación registrada correctamente.');
    }catch(err){signal(errorText(err),true);}finally{confirm.disabled=false;}
   },'primary');
   const consequence=e('p','','case-section-help');
   const effects={reviewing:'El expediente quedará en revisión.',needs_documents:'El ciudadano verá el soporte solicitado y el motivo de la corrección.',awaiting_certificate:'Se habilitará la carga y entrega del certificado.',not_proceed:'La decisión quedará reflejada en el historial.',closed:'El expediente pasará al archivo.'};
   const update=()=>{kindLabel.hidden=select.value!=='needs_documents';consequence.textContent=effects[select.value]||'';};
   select.addEventListener('change',update);update();
   form.append(field('Nuevo estado',select),kindLabel,field('Justificación de la actuación',comments),consequence,confirm);
   block.append(form);detail.append(block);
  }
  if(row.status==='awaiting_certificate'){
   const block=actionBlock('Emisión y entrega del certificado','Adjunta exclusivamente el certificado expedido por la autoridad competente. Tras confirmar, el sistema lo guardará y realizará la entrega autorizada.');
   block.id='case-next';
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
     if(result.status==='delivered')applyChange(result,'Certificado guardado y enviado al correo autorizado.');
     else if(result.status==='available')applyChange(result,'Certificado guardado y disponible para el ciudadano en el portal.');
     else {applyChange(result,'Certificado almacenado; entrega pendiente de comprobación.');signal('El envío debe verificarse antes de cualquier reintento.',true);}
    }catch(err){signal(errorText(err),true);}finally{send.disabled=false;}
   },'primary');
   block.append(destination,field('Certificado expedido (PDF, máximo 4,5 MB)',file),check,send);detail.append(block);
  }
  if(row.status==='delivery_review'){
   const block=actionBlock('Verificación de entrega','El certificado ya está guardado. No se reenviará automáticamente: primero debemos comprobar si el correo anterior fue aceptado.');
   block.id='case-next';
   const verify=b('Comprobar registro del envío',async()=>{
    verify.disabled=true;signal('Comprobando evidencia de entrega…');
    try{const updated=await invoke('officialVerifyDelivery',{id:row.id,revision:row.revision,confirm:true});applyChange(updated,'Entrega confirmada.');}
    catch(err){signal(errorText(err),true);}finally{verify.disabled=false;}
   },'secondary');block.append(verify);detail.append(block);
  }
  if(row.certificateAvailable){
   const label=row.deliveryMethod==='email'?'El certificado fue enviado al correo verificado.':'El certificado está disponible para descarga autenticada.';
   const block=actionBlock('Entrega del certificado',label);block.append(pill(row.status));
   if(['delivered','available'].includes(row.status)){
    const close=b('Archivar expediente',async()=>{
     close.disabled=true;signal('Archivando expediente…');
     try{
      const updated=await invoke('officialTransition',{id:row.id,revision:row.revision,status:'closed',
       comment:'Certificado incorporado y expediente finalizado para archivo administrativo.'});
      applyChange(updated,'Expediente archivado correctamente.');
     }catch(err){signal(errorText(err),true);}finally{close.disabled=false;}
    },'secondary');
    block.append(e('p','Al terminar la entrega, puedes archivar este expediente.','case-section-help'),close);
   }
   detail.append(block);
  }
  if(!detail.querySelector('#case-next'))tabs.querySelector('[data-section=case-next]').hidden=true;
 }
 await load();
}
