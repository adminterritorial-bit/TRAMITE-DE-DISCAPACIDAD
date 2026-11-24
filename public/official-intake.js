/* SITS Salud: institutional electronic reception. Never use the synthetic fixture path. */
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
const btn=(label,fn,cls='primary')=>{const b=el('button',label,cls);b.type='button';b.addEventListener('click',fn);return b};
function row(parent,label,name,opts={}){
 const wrap=el('label');wrap.append(el('span',label));
 const input=document.createElement(opts.select?'select':opts.multiline?'textarea':'input');
 input.name=name;
 if(opts.select){for(const choice of opts.select){const o=el('option',choice||'Seleccionar');o.value=choice;input.append(o);}}
 else if(!opts.multiline){input.type=opts.type||'text';input.maxLength=opts.max||120;input.placeholder=opts.placeholder||'';}
 if(opts.required)input.required=true;
 if(opts.pattern)input.pattern=opts.pattern;
 if(opts.autocomplete)input.autocomplete=opts.autocomplete;
 wrap.append(input);parent.append(wrap);return input;
}
export function officialIntakeUI({invoke,getUser,getAuthorized,navigate,labMode}){
 const mount=document.getElementById('applicationForm');if(!mount)throw Error('application_form_missing');
 if(labMode)return {live:false,connect:async()=>{},session:()=>{},tracking:async()=>{},inbox:async()=>{}};
 const shell=el('section',undefined,'live-intake');shell.setAttribute('aria-label','Recepción electrónica de solicitudes');mount.before(shell);
 let ready={enabled:false,documents:[]},authenticated=false,busy=false,lastKey=null,currentStep=0;
 function note(title,message,link=true){
  const area=el('div',undefined,'intake-state'),mark=el('span','◎','intake-state-icon'),body=el('div');
  body.append(el('h2',title),el('p',message));
  if(link){const a=el('a','Consultar atención municipal','secondary');a.href='https://www.sanpedro-valle.gov.co/';body.append(a);}
  area.append(mark,body);shell.replaceChildren(area);
 }
 function render(){
  if(!ready.enabled){note('Atención y orientación','La recepción electrónica de esta solicitud no está disponible temporalmente. Consulta los requisitos y canales de la Secretaría de Salud.');return;}
  if(!authenticated||!getUser()){note('Inicia sesión para presentar tu solicitud','Ingresa con tu cuenta de Google y utiliza el correo verificado para consultar el seguimiento de tu expediente.',false);return;}
  buildForm();
 }
 async function connect(endpoint){
  try{
   const response=await fetch(endpoint+'?content=official-intake',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(12000)});
   const value=await response.json();
   ready={enabled:response.ok&&value.ok===true&&value.enabled===true,documents:Array.isArray(value.documents)?value.documents:[]};
  }catch{ready={enabled:false,documents:[]};}
  render();return ready.enabled;
 }
 function session(value){authenticated=value===true;render();}
 async function validatePdf(file,kind){
  if(!file||file.size<20||file.size>4.5*1024*1024||!/\.pdf$/i.test(file.name))throw Error('Selecciona un PDF de hasta 4,5 MB.');
  const buf=await file.arrayBuffer(),bytes=new Uint8Array(buf);
  if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw Error('El archivo seleccionado no es un PDF válido.');
  const hash=await crypto.subtle.digest('SHA-256',buf),sha=[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
  const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('No se pudo leer el PDF.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});
  return {kind,sha,size:file.size,base64};
 }
 function buildForm(){
  const form=el('form',undefined,'intake-form');form.noValidate=true;form.setAttribute('aria-label','Solicitud de certificación de discapacidad');
  const title=el('div',undefined,'intake-title');title.append(el('span','SOLICITUD ELECTRÓNICA · SECRETARÍA DE SALUD','intake-kicker'),el('h2','Presenta tu solicitud'),el('p','Completa la información, adjunta los soportes PDF y revisa las condiciones antes de enviarla.'));
  const steps=el('div',undefined,'intake-steps');steps.setAttribute('role','status');
  const first=el('section',undefined,'intake-step'),second=el('section',undefined,'intake-step'),third=el('section',undefined,'intake-step');
  first.append(el('h3','1. Identificación y contacto'),el('p','Indica la información de la persona que solicita el trámite.','module-intro'));
  const basic=el('div',undefined,'intake-fields');
  row(basic,'Nombre completo *','name',{required:true,max:120,autocomplete:'name'});
  row(basic,'Tipo de documento *','documentType',{select:['','CC','TI','RC','CE','PA','OTRO'],required:true});
  row(basic,'Número de documento *','documentNumber',{required:true,max:25,pattern:'[A-Za-z0-9-]{3,25}'});
  row(basic,'Teléfono de contacto','phone',{type:'tel',max:25,autocomplete:'tel'});
  row(basic,'Zona de residencia *','zone',{select:['','Cabecera municipal','Centro poblado','Zona rural dispersa'],required:true});
  row(basic,'¿Quién presenta la solicitud? *','representation',{select:['propia','apoyo'],required:true});
  first.append(basic);
  second.append(el('h3','2. Documentos de soporte'),el('p','Los archivos deben estar en formato PDF. Se validarán antes del envío.','module-intro'));
  const box=el('div',undefined,'intake-filegrid');
  function upload(label,name,required){
   const labelEl=el('label',undefined,'intake-upload');
   labelEl.append(el('span',label+(required?' *':'')),el('small','PDF · hasta 4,5 MB por archivo'));
   const file=el('input');file.type='file';file.name=name;file.accept='.pdf,application/pdf';file.required=required;
   const filename=el('small','Ningún documento seleccionado','file-name');file.addEventListener('change',()=>{filename.textContent=file.files[0]?file.files[0].name:'Ningún documento seleccionado';});
   labelEl.append(file,filename);box.append(labelEl);return file;
  }
  const history=upload('Historia clínica o soporte médico','historia',true),extra=upload('Soporte adicional, si aplica','apoyo',false);
  second.append(box);
  row(second,'Ajustes de movilidad o comunicación solicitados','support',{multiline:true,max:300});
  third.append(el('h3','3. Tratamiento de datos y confirmación'),el('p','Verifica las condiciones aprobadas de la entidad y expresa tu decisión de manera informada.','module-intro'));
  const policyBoxes=[];
  for(const policy of ready.documents){
   const label=el('label',undefined,'intake-policy'),cb=el('input');cb.type='checkbox';cb.required=true;
   const text=el('span','He leído y comprendo: '+policy.title+'. ');
   const a=el('a','Consultar política');a.href='#legal';a.addEventListener('click',e=>{e.preventDefault();navigate('legal');});
   text.append(a);label.append(cb,text);third.append(label);policyBoxes.push({cb,policy});
  }
  const sensitive=el('label',undefined,'intake-policy'),consent=el('input');consent.type='checkbox';consent.required=true;
  sensitive.append(consent,el('span','Confirmo que comprendo el carácter sensible de la información de salud que presento y autorizo su tratamiento en las condiciones institucionales informadas, cuando corresponda.'));third.append(sensitive);
  const notify=el('label',undefined,'intake-policy'),notifyBox=el('input');notifyBox.type='checkbox';
  notify.append(notifyBox,el('span','Deseo recibir actualizaciones informativas por correo electrónico (opcional).'));third.append(notify);
  const summary=el('p','Correo asociado: '+getUser().email,'intake-email');third.prepend(summary);
  const errors=el('p','','error');errors.setAttribute('role','alert');
  const actions=el('div',undefined,'intake-actions'),back=btn('Atrás',()=>setStep(currentStep-1),'secondary'),forward=btn('Continuar',()=>{if(!validateCurrent())return;setStep(currentStep+1);}),send=el('button','Enviar solicitud','primary');send.type='submit';
  actions.append(back,forward,send);form.append(title,steps,first,second,third,errors,actions);shell.replaceChildren(form);
  function setStep(value){currentStep=Math.max(0,Math.min(2,value));[first,second,third].forEach((part,i)=>part.hidden=i!==currentStep);steps.textContent='Paso '+(currentStep+1)+' de 3';back.hidden=currentStep===0;forward.hidden=currentStep===2;send.hidden=currentStep!==2;errors.textContent='';}
  function validateCurrent(){
   const section=[first,second,third][currentStep];
   for(const element of section.querySelectorAll('input,select,textarea'))if(!element.reportValidity())return false;
   if(currentStep===1){
    const files=[history.files[0],extra.files[0]].filter(Boolean);
    if(files.some(f=>f.size>4.5*1024*1024||!/\.pdf$/i.test(f.name))||files.reduce((n,f)=>n+f.size,0)>7*1024*1024){errors.textContent='Adjunta PDF de máximo 4,5 MB cada uno y 7 MB en conjunto.';return false;}
   }
   return true;
  }
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(busy||!ready.enabled||!getAuthorized()||!validateCurrent())return;busy=true;send.disabled=true;errors.textContent='';send.textContent='Verificando y enviando…';
   try{
    const files=[await validatePdf(history.files[0],'historia')];
    if(extra.files[0])files.push(await validatePdf(extra.files[0],'apoyo'));
    if(files.reduce((n,f)=>n+f.size,0)>7*1024*1024)throw Error('El tamaño total supera 7 MB.');
    const data=Object.fromEntries(new FormData(form));
    lastKey??=crypto.randomUUID();
    const result=await invoke('officialSubmit',{...data,key:lastKey,files,medicalConsent:consent.checked,notifyByEmail:notifyBox.checked,
      legalDecisions:policyBoxes.map(({cb,policy})=>({id:policy.id,version:policy.version,hash:policy.hash,accepted:cb.checked}))});
    const status=result.status,success=status==='received'||status==='reviewing';
    const card=el('div',undefined,'intake-receipt');
    card.append(el('h2',success?'Documentación recibida':'Documentación pendiente de verificación'),
      el('p',success?'Conserva esta referencia para consultar el seguimiento desde tu cuenta.':'No repitas el envío. Comunícate con Salud si la verificación de almacenamiento no se completa.'),
      el('strong',result.reference||'Referencia no disponible'),
      el('p','La referencia no equivale al certificado de discapacidad ni sustituye un número oficial de radicación.'));
    card.append(btn('Consultar mis solicitudes',()=>navigate('tracking')));shell.replaceChildren(card);
   }catch(e){errors.textContent=e?.message||'No fue posible enviar la solicitud. No se ha confirmado su recepción.';}
   finally{busy=false;send.disabled=false;send.textContent='Enviar solicitud';}
  });
  setStep(0);
 }
 async function tracking(){
  if(!ready.enabled||!authenticated||!getUser())return;
  const container=document.getElementById('trackingList');if(!container)return;
  try{
   const response=await invoke('officialMine');
   const result=el('div',undefined,'records official-track'),heading=el('h2','Solicitudes de certificación de discapacidad');
   result.append(heading);
   for(const item of response.items||[]){
    const card=el('article',undefined,'record');card.append(el('strong',item.reference),el('small',new Date(item.createdAt).toLocaleDateString('es-CO')),el('span',item.status));result.append(card);
   }
   if(!response.items?.length)result.append(el('p','Aún no hay solicitudes en este canal.','muted'));
   container.prepend(result);
  }catch{ /* Do not expose diagnostic or clinical data in a public list. */ }
 }
 async function inbox(){/* Institutional case access is managed server-side; no public contents are rendered. */}
 note('Consultando disponibilidad','Verificando los canales habilitados para este trámite.',false);
 return {get live(){return ready.enabled},connect,session,tracking,inbox};
}
