import {element as el,action,pdfField,downloadLocal} from './ui-components.js';
const STATUS={saving:'Guardando documentos',storage_review:'Verificación de almacenamiento',
 received:'Recibida',reviewing:'En revisión',needs_documents:'Subsanación requerida',
 awaiting_certificate:'Pendiente de certificado',sending:'Preparando entrega',
 available:'Certificado disponible',delivered:'Certificado enviado',delivery_review:'Envío por verificar',
 not_proceed:'No procede',closed:'Archivada'};
const date=x=>x?new Date(x).toLocaleDateString('es-CO',{dateStyle:'medium'}):'Sin fecha';
const nextAction={needs_documents:'Acción pendiente: aportar un soporte',awaiting_certificate:'Salud está preparando el certificado',delivery_review:'Salud está verificando la entrega'};
const normalized=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
async function downloadPdf(invoke,id,kind,reference){
 const data=await invoke('officialDownload',{id,kind});
 const bytes=Uint8Array.from(atob(data.base64),char=>char.charCodeAt(0));
 downloadLocal(bytes,(kind==='certificate'?'Certificado':kind)+'-'+reference+'.pdf','application/pdf');
}
export function createOfficialTracking({invoke,validatePdf}){
 const target=document.getElementById('trackingList');
 const section=el('section',undefined,'official-track');
 const controls=el('div',undefined,'case-tools');
 const search=el('input');search.type='search';search.placeholder='Ej. SSP-2026…';
 const searchLabel=el('label','Buscar por referencia');searchLabel.append(search);
 const filter=el('select');
 const filterLabel=el('label','Estado');filterLabel.append(filter);
 const options={'':'Todos los estados',...STATUS};
 for(const [key,name] of Object.entries(options)){const option=el('option',name);option.value=key;filter.append(option);}
 controls.append(searchLabel,filterLabel);
 const status=el('p','','case-feedback');status.setAttribute('role','status');
 const list=el('div',undefined,'case-citizen-list');
 const pages=el('div',undefined,'case-pagination');
 section.append(controls,status,list,pages);
 let items=[],loaded=false,activeRequest=0,page=1,total=null,serverPaged=false;
 const limit=12;
 const describe=(node,message,error=false)=>{node.textContent=message;node.dataset.error=String(error);};
 const handleFilter=()=>{page=1;if(serverPaged)void load();else draw();};
 let searchTimer;
 search.addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(handleFilter,220);});
 filter.addEventListener('change',handleFilter);
 document.getElementById('refreshTracking')?.addEventListener('click',()=>{if(section.isConnected)void load();});
 function draw(){
  const filtered=serverPaged?items:items.filter(item=>(!filter.value||item.status===filter.value)&&normalized(item.reference).includes(normalized(search.value)));
  const count=serverPaged?total:filtered.length;
  const shown=serverPaged?filtered:filtered.slice((page-1)*limit,page*limit);
  describe(status,count+' solicitudes visibles'+(!serverPaged&&items.length===50?' en los últimos expedientes disponibles':''));
  list.replaceChildren(...shown.map(renderCard));
  if(!shown.length)list.append(el('p','No hay solicitudes para mostrar con estos criterios.','case-empty'));
  pages.replaceChildren();
  const max=Math.max(1,Math.ceil(count/limit));
  if(max>1){
   const older=action('Anterior',()=>{page--;serverPaged?void load():draw();});
   const newer=action('Siguiente',()=>{page++;serverPaged?void load():draw();});
   older.disabled=page<=1;newer.disabled=page>=max;
   pages.append(older,el('span','Página '+page+' de '+max),newer);
  }
 }
 async function load(){
  const run=++activeRequest;
  section.setAttribute('aria-busy','true');describe(status,'Consultando tus solicitudes…');
  try{
   const result=await invoke('officialMine',{search:search.value.trim(),status:filter.value,page,size:limit});
   if(run!==activeRequest)return;
   items=Array.isArray(result.items)?result.items:[];
   serverPaged=Number.isInteger(result.total);
   total=serverPaged?result.total:null;
   loaded=true;draw();
  }catch{
   if(run===activeRequest)describe(status,'No se pudieron consultar tus solicitudes. Actualiza el listado o verifica tu sesión.',true);
  }finally{if(run===activeRequest)section.removeAttribute('aria-busy');}
 }
 function renderCard(entry){
  const card=el('article',undefined,'case-citizen-card');
  const pill=el('span',STATUS[entry.status]||'Estado por consultar','case-badge');pill.dataset.status=entry.status;
  const info=el('div',undefined,'case-citizen-reference');
  info.append(el('small','Referencia de seguimiento'),el('h3',entry.reference));
  const head=el('header',undefined,'case-citizen-head');head.append(info,pill);
  card.append(head,el('p','Presentada: '+date(entry.createdAt)+' · Última actualización: '+date(entry.updatedAt),'case-date'));
  if(nextAction[entry.status])card.append(el('p',nextAction[entry.status],'case-next-action'));
  const accordion=el('details',undefined,'case-disclosure'),summary=el('summary','Ver documentos e historial');
  const detail=el('div',undefined,'case-disclosure-body');accordion.append(summary,detail);card.append(accordion);
  let expanded=false;
  async function showDetails(){
   if(!accordion.open||expanded)return;
   expanded=true;detail.replaceChildren(el('p','Consultando el expediente…','case-feedback'));
   try{
    const data=Array.isArray(entry.history)?entry:await invoke('officialRead',{id:entry.id});
    detail.replaceChildren();
    if(data.status==='needs_documents'&&['historia','apoyo'].includes(data.correctionKind))addCorrection(detail,data);
    if(data.certificateAvailable)addCertificate(detail,data);
    const heading=el('h4','Documentos asociados'),docs=el('ul',undefined,'case-associated');
    for(const item of data.files||[]){
     const li=el('li',item.kind==='historia'?'Soporte médico':'Soporte adicional');
     const message=el('small','','case-feedback');message.setAttribute('role','status');
     const button=action('Descargar PDF',async()=>{
      button.disabled=true;
      try{await downloadPdf(invoke,data.id,item.kind,data.reference);}
      catch{describe(message,'No se pudo descargar el soporte.',true);}finally{button.disabled=false;}
     });
     button.setAttribute('aria-label','Descargar '+li.textContent+' de '+data.reference);
     li.append(button,message);docs.append(li);
    }
    if(!docs.children.length)docs.append(el('li','Sin soportes disponibles'));
    const timeline=el('ol',undefined,'case-timeline');
    for(const event of [...(data.history||[])].sort((a,b)=>new Date(a.at)-new Date(b.at))){
     const item=el('li');item.append(el('strong',STATUS[event.status]||'Actuación'),
      el('small',date(event.at)),el('p',event.comment||'Registro del expediente'));timeline.append(item);
    }
    if(!timeline.children.length)timeline.append(el('li','Aún no hay actuaciones registradas.'));
    detail.append(heading,docs,el('h4','Historial cronológico'),timeline);
   }catch{expanded=false;detail.replaceChildren(el('p','No se pudo consultar el expediente.', 'error'),action('Reintentar',()=>void showDetails()));}
  }
  accordion.addEventListener('toggle',showDetails);
  if(entry.status==='needs_documents'){
   card.insertBefore(action('Ver corrección solicitada',()=>{accordion.open=true;summary.focus();}),accordion);
  }else if(entry.certificateAvailable){
   card.insertBefore(action('Ver certificado',()=>{accordion.open=true;summary.focus();}),accordion);
  }
  return card;
 }
 function addCorrection(target,entry){
  const name=entry.correctionKind==='historia'?'Soporte médico':'Soporte adicional';
  const guidance=(entry.history||[]).slice().reverse().find(x=>x.status==='needs_documents')?.comment;
  const area=el('section',undefined,'case-correction');
  area.append(el('h4','Aportar documento pendiente'),el('p','Documento requerido: '+name+'.'),el('p',guidance||'Consulta con Salud si necesitas más información sobre la corrección.'));
  const file=pdfField({label:'PDF corregido',kind:entry.correctionKind,required:true});
  const note=el('p','','error');note.setAttribute('role','alert');
  const send=action('Enviar soporte corregido',async()=>{
   if(!file.input.files[0]){note.textContent='Selecciona el PDF solicitado.';file.input.focus();return;}
   send.disabled=true;note.textContent='';
   try{
    const pdf=await validatePdf(file.input.files[0],entry.correctionKind);
    await invoke('officialCorrect',{id:entry.id,revision:entry.revision,file:pdf});
    await load();
    describe(status,'Soporte enviado. Consulta el expediente para ver la actualización.');
   }catch{note.textContent='No se confirmó la recepción del soporte. Revisa el archivo y reintenta.';}
   finally{send.disabled=false;}
  },'primary');
  area.append(file.group,send,note);target.append(area);
 }
 function addCertificate(target,entry){
  const area=el('section',undefined,'case-certificate-download');
  area.append(el('h4','Certificado disponible'),el('p',entry.status==='delivered'?'Salud registró la entrega por correo. También puedes descargarlo aquí.':'Consulta el certificado de forma privada.'));
  const feedback=el('p','','case-feedback');feedback.setAttribute('role','status');
  const button=action('Descargar certificado PDF',async()=>{
   button.disabled=true;
   try{await downloadPdf(invoke,entry.id,'certificate',entry.reference);}
   catch{describe(feedback,'No se pudo descargar el certificado. Verifica tu sesión.',true);}
   finally{button.disabled=false;}
  });
  area.append(button,feedback);target.append(area);
 }
 return {
  show(){if(!section.isConnected)target.replaceChildren(section);if(!loaded)return load();},
  clear(){activeRequest++;loaded=false;items=[];total=null;serverPaged=false;page=1;search.value='';filter.value='';list.replaceChildren();pages.replaceChildren();section.remove();}
 };
}
