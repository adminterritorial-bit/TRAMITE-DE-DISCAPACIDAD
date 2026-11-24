export function element(tag,text,className){
 const node=document.createElement(tag);
 if(text!==undefined)node.textContent=text;
 if(className)node.className=className;
 return node;
}
export function action(label,handler,className='secondary'){
 const button=element('button',label,className);
 button.type='button';
 button.addEventListener('click',handler);
 return button;
}
const icons={
 upload:'M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4',
 file:'M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6',
 shield:'M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10zM8 12l3 3 5-6'
};
export function icon(name){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');
 svg.setAttribute('aria-hidden','true');
 svg.setAttribute('focusable','false');
 const path=document.createElementNS(svg.namespaceURI,'path');
 path.setAttribute('d',icons[name]||icons.file);
 path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');
 path.setAttribute('stroke-width','1.7');path.setAttribute('stroke-linejoin','round');
 path.setAttribute('stroke-linecap','round');svg.append(path);
 return svg;
}
const filePayloads=new WeakMap();
export async function validatePdf(file,kind){
 if(!file||file.size<20||file.size>4.5*1024*1024||!/\.pdf$/i.test(file.name))
  throw Error('Selecciona un PDF válido de hasta 4,5 MB.');
 let pending=filePayloads.get(file);
 if(!pending){
  pending=(async()=>{
   const buf=await file.arrayBuffer(),bytes=new Uint8Array(buf);
   if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw Error('El contenido del archivo no corresponde a un PDF.');
   const hash=await crypto.subtle.digest('SHA-256',buf);
   const sha=Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
   const base64=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(Error('No fue posible leer el archivo.'));
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
   });
   return {sha,size:file.size,base64};
  })();
  filePayloads.set(file,pending);
 }
 return {kind,...await pending};
}
export function pdfField({label,kind,required=false}){
 const group=element('div',undefined,'pdf-field');
 const input=element('input');input.type='file';input.accept='.pdf,application/pdf';
 input.name=kind;input.required=required;input.id='pdf-'+crypto.randomUUID();
 const caption=element('label',undefined,'pdf-label');caption.htmlFor=input.id;
 caption.append(icon('upload'),element('span',label+(required?' *':'')));
 const guidance=element('small','PDF de hasta 4,5 MB. Puedes arrastrarlo o seleccionarlo.');
 guidance.id=input.id+'-help';
 const feedback=element('small','Ningún PDF seleccionado','pdf-feedback');
 feedback.setAttribute('role','status');
 const error=element('p','','error field-error');error.id=input.id+'-error';error.hidden=true;
 input.setAttribute('aria-describedby',guidance.id+' '+error.id);
 const remove=action('Quitar PDF',()=>{input.value='';inspect();input.focus();},'quiet');remove.hidden=true;
 let attempt=0;
 function report(message){
  input.setCustomValidity(message);
  error.textContent=message;error.hidden=!message;
  if(message)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');
 }
 async function inspect(){
  const current=++attempt,file=input.files[0];
  report('');remove.hidden=!file;
  if(!file){feedback.textContent='Ningún PDF seleccionado';return;}
  feedback.textContent='Verificando '+file.name;
  try{
   await validatePdf(file,kind);
   if(current===attempt)feedback.textContent=file.name+' · '+new Intl.NumberFormat('es-CO',{maximumFractionDigits:1}).format(file.size/1024)+' KB';
  }catch(e){if(current===attempt){feedback.textContent='Reemplaza el archivo seleccionado.';report(e.message);}}
 }
 input.addEventListener('change',inspect);
 group.addEventListener('dragover',event=>{event.preventDefault();group.classList.add('is-dropping');});
 group.addEventListener('dragleave',()=>group.classList.remove('is-dropping'));
 group.addEventListener('drop',event=>{
  event.preventDefault();group.classList.remove('is-dropping');
  const files=event.dataTransfer?.files;
  if(files?.length!==1){feedback.textContent='Selecciona un solo PDF para este campo.';return;}
  input.files=files;void inspect();
 });
 group.append(caption,guidance,input,feedback,remove,error);
 return {group,input,report};
}
export function downloadLocal(content,filename,type){
 const url=URL.createObjectURL(new Blob([content],{type}));
 const link=element('a');link.href=url;link.download=filename;
 document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
