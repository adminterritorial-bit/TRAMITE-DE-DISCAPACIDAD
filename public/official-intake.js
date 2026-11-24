/* SITS Salud: institutional electronic reception. Never use the synthetic fixture path. */
import {element as el,action as btn,icon,pdfField,validatePdf,downloadLocal} from './ui-components.js';
function row(parent,label,name,opts={}){
 const wrap=el('label');wrap.append(el('span',label));
 const input=document.createElement(opts.select?'select':opts.multiline?'textarea':'input');
 input.name=name;input.id='intake-'+name;
 if(opts.max)input.maxLength=opts.max;
 if(opts.select){for(const choice of opts.select){const o=el('option',choice||'Seleccionar');o.value=choice;input.append(o);}}
 else if(!opts.multiline){input.type=opts.type||'text';input.maxLength=opts.max||120;input.placeholder=opts.placeholder||'';}
 if(opts.required)input.required=true;
 if(opts.pattern)input.pattern=opts.pattern;
 if(opts.autocomplete)input.autocomplete=opts.autocomplete;
 wrap.append(input);parent.append(wrap);return input;
}
export function officialIntakeUI({invoke,getUser,getAuthorized,navigate,labMode}){
 const mount=document.getElementById('applicationForm');if(!mount)throw Error('application_form_missing');
 if(labMode)return {live:false,connect:async()=>{},session:()=>{},tracking:async()=>{},inbox:async()=>{},selectService:()=>false,resetService:()=>{}};
 const shell=el('section',undefined,'live-intake');shell.setAttribute('aria-label','Recepción electrónica de solicitudes');mount.before(shell);
 let ready={enabled:false,documents:[]},authenticated=false,pilotAccess=false,builtFor=null;
 let selectedService=null;
 function selectService(service){
  if(!service||service.intakeEnabled!==true||!Array.isArray(service.intakeSchema?.fields)
     ||service.intakeSchema.version!==service.version)return false;
  selectedService=service;builtFor=null;render();return true;
 }
 function resetService(){selectedService=null;builtFor=null;render();}
 let tracker,staffInbox;
 function note(title,message,link=true){
  const area=el('div',undefined,'intake-state'),mark=el('span',undefined,'ui-icon'),body=el('div');
  mark.append(icon('shield'));
  body.append(el('h2',title),el('p',message));
  if(link){body.append(btn('Canales de atención',()=>navigate('help'),'secondary'));}
  area.append(mark,body);shell.replaceChildren(area);
 }
 function render(){
  if(!ready.enabled){note('Atención y orientación','La recepción electrónica no está disponible en este momento. Consulta los requisitos y canales de la Secretaría de Salud.');return;}
  if(ready.accepting!==true&&!pilotAccess){note('Recepción electrónica restringida','Consulta los canales de la Secretaría de Salud para presentar una solicitud.');return;}
  const account=getUser();
  if(!authenticated||!account){note('Inicia sesión para presentar tu solicitud','Ingresa con Google para presentar una solicitud y consultar tu expediente desde la cuenta asociada.',false);return;}
  const formKey=account.uid+':'+(selectedService?.id||'discapacidad');
  if(builtFor!==formKey){builtFor=formKey;buildForm(account);}
 }
 async function connect(endpoint,expectedBuild=''){
  try{
   const response=await fetch(endpoint+'?content=official-intake'+(expectedBuild?'&probe=sits-supabase-v1':''),{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(12000)});
   const value=await response.json();
   ready={accepting:value.acceptingRequests===true?true:value.acceptingRequests===false?false:null,enabled:response.ok&&value.ok===true&&(!expectedBuild||value.build===expectedBuild)&&value.enabled===true&&Array.isArray(value.documents)&&value.documents.length===4&&value.documents.every(x=>/^[a-f0-9]{64}$/.test(x.hash||'')&&Number.isInteger(x.version)),documents:Array.isArray(value.documents)?value.documents:[]};
  }catch{ready={enabled:false,documents:[]};}
  render();return ready.enabled;
 }
 function session(value,{testIntake=false}={}){
  authenticated=value===true;
  pilotAccess=authenticated&&testIntake;
  if(!authenticated){
   if(builtFor){builtFor=null;shell.replaceChildren();}
   tracker?.clear();staffInbox?.clear();
  }
  render();
 }
 function buildForm(account){
  const form=el('form',undefined,'intake-form');form.noValidate=true;
  const configured=selectedService?.intakeEnabled===true;
  const serviceSchema=configured?selectedService.intakeSchema:null;
  form.setAttribute('aria-label',configured?'Solicitud de '+selectedService.title:'Solicitud de certificación de discapacidad');
  const labels=['Identificación','Contacto y representación','Documentos','Autorizaciones','Revisión y envío'];
  const panels=labels.map((label,i)=>{
   const panel=el('section',undefined,'intake-step');
   panel.id='intake-step-'+i;
   const heading=el('h3',label);heading.tabIndex=-1;
   panel.append(heading);return panel;
  });
  const [identity,contact,filesPanel,permissions,review]=panels;
  const title=el('div',undefined,'intake-title');
  title.append(el('h2',configured?selectedService.title:'Presenta tu solicitud'),el('p','Completa los datos y revisa la solicitud antes de enviarla.'));
  if(ready.accepting!==true&&pilotAccess)title.append(el('p','Prueba institucional. Usa únicamente datos y PDF ficticios.','ui-service-status'));
  const progress=el('ol',undefined,'intake-progress');
  progress.setAttribute('aria-label','Pasos de la solicitud');
  const progressItems=labels.map(label=>el('li',label));progress.append(...progressItems);
  const stepStatus=el('p',undefined,'intake-step-number');stepStatus.setAttribute('role','status');
  const fields=el('div',undefined,'intake-fields');
  row(fields,'Nombre completo *','name',{required:true,max:120,autocomplete:'name'});
  row(fields,'Tipo de documento *','documentType',{select:['','CC','TI','RC','CE','PA','OTRO'],required:true});
  row(fields,'Número de documento *','documentNumber',{required:true,max:25,pattern:'[A-Za-z0-9\\-]{3,25}'});
  identity.append(fields);
  const contactFields=el('div',undefined,'intake-fields');
  contact.append(el('p','Correo verificado: '+account.email,'intake-email'),contactFields);
  row(contactFields,'Teléfono de contacto','phone',{type:'tel',max:25,autocomplete:'tel'});
  row(contactFields,'Zona de residencia *','zone',{select:['','Cabecera municipal','Centro poblado','Zona rural dispersa'],required:true});
  const representative=row(contactFields,'¿Quién presenta la solicitud? *','representation',{select:['propia','apoyo'],required:true});
  representative.options[0].textContent='La propia persona';
  representative.options[1].textContent='Una persona de apoyo';
  row(contact,'Ajustes de movilidad o comunicación solicitados','support',{multiline:true,max:300});
  const dynamicInputs=new Map();
  const extraSpecs=Array.isArray(serviceSchema?.fields)?
   serviceSchema.fields.filter(spec=>spec.type!=='document'):[];
  if(configured&&extraSpecs.length){
   const additional=el('div',undefined,'configured-service-fields');
   additional.append(el('h4','Información específica del trámite'));
   const extraGrid=el('div',undefined,'intake-fields');
   for(const spec of extraSpecs){
    const label=spec.label+(spec.required?' *':'');
    const opts={required:spec.required===true,
      ...(['select','radio'].includes(spec.type)?{select:['',...(spec.options||[])]}:
      spec.type==='textarea'?{multiline:true,max:2000}:
      spec.type==='checkbox'?{type:'checkbox'}:
      spec.type==='number'?{type:'number',max:20}:
      spec.type==='date'?{type:'date'}:{max:350})};
    const input=row(extraGrid,label,'service__'+spec.id,opts);
    dynamicInputs.set(spec.id,{input,spec});
   }
   additional.append(extraGrid);contact.append(additional);
  }
  function applyConditions(){
   for(const {input,spec} of dynamicInputs.values()){
    if(!spec.condition)continue;
    const dependent=dynamicInputs.get(spec.condition.field)?.input;
    const visible=!!dependent&&dependent.value===spec.condition.equals;
    input.closest('label').hidden=!visible;
    input.disabled=!visible;
    input.required=visible&&spec.required===true;
    if(!visible){if(input.type==='checkbox')input.checked=false;else input.value='';}
   }
  }
  form.addEventListener('change',applyConditions);
  form.addEventListener('input',applyConditions);
  applyConditions();
  filesPanel.append(el('p',configured?'Adjunta los soportes indicados para este trámite. Máximo 4,5 MB por PDF y 7 MB en total.':
    'Adjunta máximo 4,5 MB por PDF y 7 MB en total.'));
  const fileGrid=el('div',undefined,'intake-filegrid');
  const requestedDocs=configured?serviceSchema.fields.filter(spec=>spec.type==='document'):[];
  const mainDoc=requestedDocs.find(spec=>spec.fixture==='historia');
  const extraDoc=requestedDocs.find(spec=>spec.fixture==='apoyo');
  const history=pdfField({label:mainDoc?.label||'Historia clínica o soporte médico',kind:'historia',
   required:configured?mainDoc?.required===true:true});
  const extra=pdfField({label:extraDoc?.label||'Soporte adicional, si aplica',kind:'apoyo',
   required:configured?extraDoc?.required===true:false});
  const pdfSlots=[];
  if(!configured||mainDoc){fileGrid.append(history.group);pdfSlots.push({kind:'historia',...history});}
  if(!configured||extraDoc){fileGrid.append(extra.group);pdfSlots.push({kind:'apoyo',...extra});}
  if(pdfSlots.length)filesPanel.append(fileGrid);
  else filesPanel.append(el('p','Este trámite no requiere adjuntar documentos PDF.','ui-service-status'));
  permissions.append(el('p','Lee las condiciones institucionales y selecciona las autorizaciones que apliquen.'));
  function check(parent,text,required=false){
   const wrapper=el('label',undefined,'intake-policy'),box=el('input');
   box.type='checkbox';box.required=required;
   wrapper.append(box,el('span',text));parent.append(wrapper);
   return box;
  }
  const policyBoxes=ready.documents.map(policy=>{
   const detail=el('details',undefined,'intake-policy-details');
   detail.append(el('summary',policy.title),el('p',policy.body));
   permissions.append(detail);
   return {policy,cb:check(permissions,'He leído: '+policy.title,true)};
  });
  const consent=check(permissions,'Autorizo el tratamiento de mis datos sensibles de salud para gestionar esta solicitud, según las condiciones informadas.',true);
  const notify=check(permissions,'Deseo recibir avisos sobre mi solicitud por correo. (Opcional)');
  const certificateEmail=check(permissions,'Autorizo el envío del certificado PDF al correo verificado. (Opcional)');
  const answerList=el('dl',undefined,'intake-review');
  review.append(el('p','Puedes editar cualquier sección antes de enviar.'),answerList);
  const errors=el('div','','error intake-errors');errors.setAttribute('role','alert');errors.tabIndex=-1;
  const activity=el('p','','case-feedback');activity.setAttribute('role','status');
  const actions=el('div',undefined,'intake-actions');
  let step=0,furthest=0,busy=false,key;
  const previous=btn('Atrás',()=>showStep(step-1),'secondary');
  const next=btn('Continuar',async()=>{if(await validateStep(step))showStep(step+1);});
  const send=el('button','Enviar solicitud','primary');send.type='submit';
  actions.append(previous,next,send);form.append(title,progress,stepStatus,panels[0],panels[1],panels[2],panels[3],panels[4],errors,activity,actions);
  shell.replaceChildren(form);
  const fieldErrors=new Map();
  function setError(input,message){
   let hint=fieldErrors.get(input);
   if(!hint){
    input.id||='campo-'+crypto.randomUUID();
    hint=el('small','','field-error error');hint.id=input.id+'-error';
    input.setAttribute('aria-describedby',hint.id);
    input.closest('label')?.after(hint);fieldErrors.set(input,hint);
   }
   hint.textContent=message;hint.hidden=!message;
   if(message)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');
  }
  form.addEventListener('input',event=>{if(fieldErrors.has(event.target))setError(event.target,'');});
  function summarize(issues){
   errors.replaceChildren();
   if(!issues.length)return;
   errors.append(el('strong','Revisa la información antes de continuar.'));
   const list=el('ul');
   for(const [input,message] of issues){
    const item=el('li'),jump=btn(message,()=>input.focus(),'quiet');
    item.append(jump);list.append(item);
   }
   errors.append(list);errors.focus();
  }
  function showStep(n,focus=true){
   step=Math.max(0,Math.min(panels.length-1,n));furthest=Math.max(furthest,step);
   panels.forEach((panel,i)=>panel.hidden=i!==step);
   progressItems.forEach((item,i)=>{
    if(i===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
    item.dataset.complete=String(i<furthest&&i!==step);
   });
   stepStatus.textContent='Paso '+(step+1)+' de '+panels.length;
   previous.hidden=step===0;next.hidden=step===panels.length-1;send.hidden=!next.hidden;
   errors.replaceChildren();
   if(step===panels.length-1)fillReview();
   if(focus)panels[step].querySelector('h3').focus();
  }
  function fillReview(){
   const data=new FormData(form);
   const labelValues=[
    ['Nombre',data.get('name'),0],['Identificación',data.get('documentType')+' '+data.get('documentNumber'),0],
    ['Correo verificado',account.email,1],['Teléfono',data.get('phone')||'Sin registrar',1],
    ['Zona',data.get('zone'),1],['Presentación',representative.selectedOptions[0].textContent,1],
    ['Ajustes solicitados',data.get('support')||'Ninguno registrado',1],
    ...(!configured||mainDoc?[[mainDoc?.label||'Soporte médico',history.input.files[0]?.name,2]]:[]),
    ...(!configured||extraDoc?[[extraDoc?.label||'Soporte adicional',extra.input.files[0]?.name||'Sin adjuntar',2]]:[]),
    ...Array.from(dynamicInputs.values(),({input,spec})=>[spec.label,
      input.disabled?'No aplica':spec.type==='checkbox'?(input.checked?'Sí':'No'):input.value||'Sin registrar',1]),
    ['Avisos por correo',notify.checked?'Autorizados':'Sin autorización',3],
    ['Entrega del certificado',certificateEmail.checked?'Correo verificado y portal':'Portal autenticado',3]
   ];
   answerList.replaceChildren(...labelValues.map(([label,value,from])=>{
    const line=el('div'),answer=el('dd',String(value||'—'));
    const edit=btn('Editar',()=>showStep(from),'quiet');edit.setAttribute('aria-label','Editar '+label);
    answer.append(edit);line.append(el('dt',label),answer);return line;
   }));
  }
  async function validateStep(n){
   const issues=[];
   if(n===2){
    const attachments=pdfSlots;
    for(const item of attachments){
     const file=item.input.files[0];
     if(!file&&!item.input.required)continue;
     try{await validatePdf(file,item.input.name);item.report('');}
     catch(e){item.report(e.message);issues.push([item.input,e.message]);}
    }
    if(!issues.length&&attachments.reduce((total,item)=>total+(item.input.files[0]?.size||0),0)>7*1024*1024){
     const reason='El total de los dos PDF debe ser de máximo 7 MB.';
     const last=attachments[attachments.length-1];last.report(reason);issues.push([last.input,reason]);
    }
   }else{
    for(const input of panels[n].querySelectorAll('input,select,textarea')){
     const fieldLabel=input.closest('label')?.textContent.replace(/\s*\*\s*$/,'').trim();
     const message=input.validity.valid?'':input.type==='checkbox'
      ?'Marca la autorización o lectura obligatoria.'
      :fieldLabel+': '+(input.validity.valueMissing?'Completa este campo.':'Revisa el formato del dato.');
     setError(input,message);
     if(message)issues.push([input,message]);
    }
   }
   summarize(issues);return !issues.length;
  }
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(busy||step!==panels.length-1||!getAuthorized()||getUser()?.uid!==account.uid)return;
   busy=true;send.disabled=true;previous.disabled=true;send.textContent='Enviando solicitud…';
   try{
    activity.textContent='Preparando archivos y verificando su integridad.';
    const attachments=pdfSlots.filter(slot=>slot.input.files[0]);
    const payloads=await Promise.all(attachments.map(slot=>validatePdf(slot.input.files[0],slot.kind)));
    const fields=Object.fromEntries([...new FormData(form)].filter(([,value])=>typeof value==='string'));
    key??=crypto.randomUUID();
    activity.textContent='Enviando los soportes para almacenamiento y verificación.';
    const answers={};
    for(const [id,{input,spec}] of dynamicInputs){
     if(input.disabled)continue;
     if(spec.type==='checkbox')answers[id]=input.checked;
     else if(input.value!=='')answers[id]=input.value;
    }
    const operation=configured?'configuredSubmit':'officialSubmit';
    const result=await invoke(operation,{...fields,key,files:payloads,
      ...(configured?{serviceId:selectedService.id,serviceVersion:serviceSchema.version,answers}:{}),
      medicalConsent:consent.checked,notifyByEmail:notify.checked,certificateEmailConsent:certificateEmail.checked,
      legalDecisions:policyBoxes.map(({cb,policy})=>({id:policy.id,version:policy.version,hash:policy.hash,accepted:cb.checked}))});
    if(!form.isConnected)return;
    if(!result?.reference)throw Error('La recepción aún no pudo verificarse. Reintenta este envío para consultar la misma referencia.');
    const confirmed=['received','reviewing'].includes(result.status);
    const receipt=el('article',undefined,'intake-receipt');
    const heading=el('h2',confirmed?'Documentación recibida':'Documentación pendiente de verificación');heading.tabIndex=-1;
    const reference=el('strong',result.reference,'intake-reference');
    receipt.append(heading,el('p',confirmed?'Conserva tu referencia para consultar el expediente.':'Salud debe verificar el almacenamiento. Conserva la referencia y revisa el estado antes de enviar nuevamente.'),reference);
    const date=Date.parse(result.createdAt)||Number(result.createdAt)||0;
    if(date)receipt.append(el('p','Fecha de registro: '+new Date(date).toLocaleString('es-CO',{dateStyle:'long',timeStyle:'short'})));
    receipt.append(el('p','La referencia de seguimiento no sustituye una radicación oficial.'));
    const controls=el('div',undefined,'intake-actions');
    controls.append(btn('Consultar mis solicitudes',()=>navigate('tracking')));
    if(confirmed)controls.append(btn('Guardar constancia',()=>{
     const content=Array.from(receipt.children).filter(item=>item.matches('h2,p,strong')).map(item=>item.textContent).join('\n');
     downloadLocal('SITS Salud · Secretaría de Salud de San Pedro\n'+content+'\n','constancia-sits.txt','text/plain;charset=utf-8');
    },'secondary'));
    receipt.append(controls);shell.replaceChildren(receipt);heading.focus();
   }catch(error){
    if(!form.isConnected)return;
    activity.textContent='';
    const code=error?.message||'';
    const message=code.includes('pilot_disabled')
     ?'La recepción de solicitudes reales está restringida en este momento. Consulta los canales de Salud.'
     :code.includes('legal_version_changed')
       ?'Las condiciones del trámite cambiaron. Actualiza la página antes de volver a continuar.'
       :'No se confirmó la recepción. Puedes reintentar con esta misma solicitud o consultar con Salud.';
    errors.textContent=message;errors.focus();
   }finally{busy=false;send.disabled=false;previous.disabled=false;send.textContent='Enviar solicitud';}
  });
  showStep(0,false);
 }
 async function tracking(){
  if(!authenticated||!getUser())return;
  if(!tracker){const {createOfficialTracking}=await import('./official-tracking.js');tracker??=createOfficialTracking({invoke,validatePdf});}
  if(authenticated)await tracker.show();
 }
 async function inbox(){
  if(!authenticated||!getUser())return;
  if(!staffInbox){const {renderOfficialStaffInbox}=await import('./official-staff.js?v=suite-flows-1');staffInbox??={show:()=>renderOfficialStaffInbox({invoke,validatePdf,sessionUserId:getUser()?.uid}),clear:()=>document.getElementById('officialInbox')?.remove()};}
  if(authenticated)await staffInbox.show();
 }
 function receptionStatus(){
  if(!ready.enabled)return 'Recepción electrónica no disponible';
  if(ready.accepting===false)return 'Recepción real restringida';
  if(ready.accepting===true)return 'Recepción electrónica disponible';
  return 'Disponibilidad de recepción por confirmar';
 }
 note('Consultando disponibilidad','Verificando los canales habilitados para este trámite.',false);
 return {get live(){return !labMode;},connect,session,tracking,inbox,selectService,resetService,receptionStatus,get accepting(){return ready.accepting;}};
}
