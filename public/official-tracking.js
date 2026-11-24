// Seguimiento autenticado de solicitudes de Salud y entrega segura de certificados.
const STATUS={saving:'Guardando documentos',storage_review:'Verificación de almacenamiento',
 received:'Recibida',reviewing:'En revisión',needs_documents:'Subsanación requerida',
 awaiting_certificate:'Pendiente de certificado',sending:'Preparando entrega',
 available:'Certificado disponible',delivered:'Certificado enviado',
 delivery_review:'Envío por verificar',not_proceed:'No procede',closed:'Archivada'};
const el=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x};
const date=x=>x?new Date(x).toLocaleDateString('es-CO'):'—';
async function savePdfFromPortal({invoke,id,kind,reference}){
 const data=await invoke('officialDownload',{id,kind});
 const bytes=Uint8Array.from(atob(data.base64),char=>char.charCodeAt(0));
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),link=el('a');
 link.href=url;link.download='Certificado-'+reference+'.pdf';document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function renderOfficialTracking({invoke,validatePdf}){
 const target=document.getElementById('trackingList');if(!target)return;
 const section=el('section',undefined,'official-track');section.append(el('h2','Mis solicitudes de Salud'),el('p','Aquí puedes consultar el estado de tus expedientes y los documentos disponibles.','muted'));
 target.replaceChildren(section);
 try{
  const result=await invoke('officialMine');
  const items=Array.isArray(result.items)?result.items:[];
  for(const entry of items){
   const card=el('article',undefined,'case-citizen-card');
   const state=el('span',STATUS[entry.status]||entry.status,'case-badge');state.dataset.status=entry.status;
   const head=el('div',undefined,'case-citizen-head');
   head.append(el('strong',entry.reference),state,el('small','Presentada: '+date(entry.createdAt)));
   card.append(head);
   if(entry.status==='needs_documents'&&['historia','apoyo'].includes(entry.correctionKind)){
    const label=entry.correctionKind==='historia'?'Soporte médico':'Soporte adicional';
    const area=el('div',undefined,'case-correction');
    area.append(el('h3','Actualizar documento'),el('p','Salud solicita corregir o adjuntar: '+label+'.'));
    const guidance=(entry.history||[]).slice().reverse().find(x=>x.status==='needs_documents')?.comment;
    if(guidance)area.append(el('p',guidance,'case-guidance'));
    const file=el('input');file.type='file';file.accept='.pdf,application/pdf';
    file.setAttribute('aria-label','Nuevo '+label+' para '+entry.reference);
    const send=el('button','Enviar soporte corregido','primary');send.type='button';
    const note=el('p','','error');note.setAttribute('role','alert');
    send.addEventListener('click',async()=>{
     if(!file.files[0]){note.textContent='Selecciona el PDF solicitado.';return;}
     send.disabled=true;note.textContent='';
     try{
      const pdf=await validatePdf(file.files[0],entry.correctionKind);
      await invoke('officialCorrect',{id:entry.id,revision:entry.revision,file:pdf});
      await renderOfficialTracking({invoke,validatePdf});
     }catch(err){note.textContent='No fue posible enviar el soporte. '+(err?.message||'Consulta con Salud.');}
     finally{send.disabled=false;}
    });
    area.append(file,send,note);card.append(area);
   }
   if(entry.certificateAvailable){
    const area=el('div',undefined,'case-certificate-download');
    area.append(el('p',entry.deliveryMethod==='email'?'El certificado se preparó para entrega electrónica y también puede descargarse aquí.':'Tu certificado puede descargarse de forma privada. El estado del envío al correo se consulta por separado.'));
    const download=el('button','Descargar certificado PDF','secondary');download.type='button';
    const error=el('p','','error');error.setAttribute('role','alert');
    download.addEventListener('click',async()=>{
     download.disabled=true;error.textContent='';
     try{await savePdfFromPortal({invoke,id:entry.id,kind:'certificate',reference:entry.reference});}
     catch{error.textContent='No se pudo descargar. Verifica tu sesión e inténtalo nuevamente.';}
     finally{download.disabled=false;}
    });
    area.append(download,error);card.append(area);
   }
   const accordion=el('details'),title=el('summary','Ver historial de actuaciones'),timeline=el('ol',undefined,'case-timeline');
   for(const event of [...(entry.history||[])].reverse()){
    const item=el('li');item.append(el('strong',STATUS[event.status]||event.status),
     el('small',date(event.at)),el('p',event.comment||'Actuación registrada'));timeline.append(item);
   }
   if(!timeline.children.length)timeline.append(el('li','Aún no se registran actuaciones.'));
   accordion.append(title,timeline);card.append(accordion);section.append(card);
  }
  if(!items.length)section.append(el('p','Todavía no hay solicitudes registradas.','muted'));
 }catch{
  section.append(el('p','No se pudieron consultar tus solicitudes. Reingresa con Google para actualizar el listado.','error'));
 }
}
