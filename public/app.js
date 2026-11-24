import {config} from './config.js';
import {portalExperience} from './institutional.js?v=studio-1';
import {serviceCatalog} from './catalog.js?v=studio-1';
import {accessiblePortal,trackingAccess} from './accessibility.js?v=2';
const demo=false;
const labMode=demo||location.pathname.endsWith('/pilot.html');document.body.classList.toggle('pilot-mode',labMode);
import {fixtureHashes} from './pilot-fixtures/hashes.js';
import {officialIntakeUI} from './official-intake.js?v=1';
const $=id=>document.getElementById(id), all=(sel,el=document)=>[...el.querySelectorAll(sel)], form=$('applicationForm');
const statusNames={saving:'Guardando soportes',received:'Recibida',reviewing:'En revisión',needs_documents:'Requiere documentos',awaiting_certificate:'Pendiente de certificado',sending:'Enviando notificación',sent:'Notificación enviada',archived:'Documento archivado',storage_review:'Revisión de almacenamiento',delivery_review:'Revisión del envío'};
let authorized=false;let stage=0, user=null, api=null, adminItems=[], selected=null, adminRole=null, requestKey=null, currentView='citizen', demoItems=[];
const hide=(el,val=true)=>el.classList.toggle('hidden',val);
const msg=(id,txt='')=>{$(id).textContent=txt};
function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e}
function append(parent,...children){parent.append(...children);return parent}
function button(text,fn,klass='secondary'){const b=node('button',text,klass);b.type='button';b.addEventListener('click',fn);return b}
function displayError(id,e){msg(id,e?.message?.slice(0,220)||'Ocurrió un error. Inténtalo de nuevo.')}
function showView(v){currentView=v;workspaceMode(v==='admin'&&!!adminRole);experience.view(v);if(['legal','communications','tracking','admin','catalog','citizen'].includes(v)&&!demo)history.replaceState(null,'','#'+v);all('.view').forEach(s=>hide(s,s.id!==v));all('.navbtn').forEach(b=>{const a=b.dataset.view===v;b.classList.toggle('active',a);if(a)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});$('main').focus({preventScroll:true});accessibility.view(v);if(!demo)trackingGate.view(v,authorized);if(v==='tracking'){loadTracking();void catalog.tracking();if(!labMode)void officialUI.tracking();}if(v==='admin')loadAdmin()}
all('[data-view]').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
const experience=portalExperience({demo,navigate:showView,invoke});
const catalog=serviceCatalog({demo,navigate:showView,invoke,experience,fixtureData,downloadContent});
const accessibility=accessiblePortal({navigate:showView});
const officialUI=officialIntakeUI({invoke,getUser:()=>user,getAuthorized:()=>authorized,navigate:showView,labMode});
const workspaceStrip=node('div',undefined,'workspace-strip');workspaceStrip.hidden=true;
const workspaceLabel=node('div',undefined,'workspace-identity'),workspaceName=node('strong','SITS Salud · Gestión institucional'),workspaceRole=node('span','');workspaceLabel.append(workspaceName,workspaceRole);
const publicSwitch=button('Portal ciudadano',()=>showView('catalog'),'secondary');workspaceStrip.append(workspaceLabel,publicSwitch);
document.querySelector('.nav').after(workspaceStrip);
function workspaceMode(on){document.body.classList.toggle('staff-workspace',on);workspaceStrip.hidden=!on;if(on){workspaceRole.textContent=({supervisor:'Supervisor',admin:'Administrador funcional',operator:'Operador'}[adminRole]||'Personal autorizado');}}
function clearWorkspace(){workspaceMode(false);const dashboard=$('adminDashboard');delete dashboard.dataset.activeModule;dashboard.querySelectorAll('.institutional-admin,.catalog-manager').forEach(el=>el.hidden=true);}

let trackingLogin=null;
const trackingGate=trackingAccess({navigate:showView,login:async()=>{if(!trackingLogin)throw Error('El inicio de sesión aún no está disponible. Reintenta cuando se complete la conexión.');await trackingLogin();}});
if(demo)trackingGate.session(true);
$('contrast').addEventListener('click',()=>{let on=document.body.classList.toggle('hc');$('contrast').setAttribute('aria-pressed',String(on))});
$('scale').addEventListener('click',()=>{let on=document.documentElement.classList.toggle('large');$('scale').setAttribute('aria-pressed',String(on))});
function phase(n){stage=n;all('.step').forEach(e=>hide(e,Number(e.dataset.step)!==n));all('.steps li').forEach((e,i)=>{e.classList.toggle('current',i===n);e.classList.toggle('complete',i<n);if(i===n)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current')});msg('stepLabel','Paso '+(n+1)+' de 3');$('progress').setAttribute('aria-valuenow',String(n+1));$('progress').firstElementChild.style.width=(n+1)*100/3+'%';hide($('back'),n===0);hide($('next'),n===2);hide($('submit'),n!==2);msg('formError');if(n===2)review();}
function validStep(n){const parent=form.querySelector('[data-step="'+n+'"]');for(const i of all('input,select,textarea',parent)){if(demo&&i.type==='file')continue;if(!i.reportValidity())return false;}if(n===1){const f=[form.history.files[0],form.extra.files[0]].filter(Boolean);if(f.some(x=>x.size>5*1024*1024||!x.name.toLowerCase().endsWith('.pdf'))||f.reduce((s,x)=>s+x.size,0)>8*1024*1024){msg('formError','Selecciona PDF de hasta 5 MB por archivo y 8 MB en total.');return false}}return true;}
function review(){const d=$('review');d.replaceChildren();[['Nombre',form.elements.name.value],['Identificación',form.documentType.value+' '+form.documentNumber.value],['Residencia',form.zone.value],['Correo',user?.email||'prueba@example.invalid'],['Historia clínica',form.history.files[0]?.name||'Soporte simulado'],['Apoyo',form.extra.files[0]?.name||'No adjunto']].forEach(([k,v])=>{const pair=node('div');append(pair,node('dt',k),node('dd',v));d.append(pair)});}
$('next').onclick=async()=>{
 if(!validStep(stage))return;
 if(stage!==1||demo){phase(stage+1);return;}
 const b=$('next');b.disabled=true;msg('formError');
 try{await fixtureFile(form.history.files[0],'historia');if(form.extra.files[0])await fixtureFile(form.extra.files[0],'apoyo');phase(2);}
 catch(e){displayError('formError',e);}
 finally{b.disabled=false;}
};
$('back').onclick=()=>phase(stage-1);
function fileData(f){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('No se pudo leer el archivo.'));reader.onload=()=>resolve({base64:String(reader.result).split(',')[1]});reader.readAsDataURL(f)})}
async function fixtureFile(file,kind){
 if(!file||file.size>5*1024*1024)throw Error('Selecciona el PDF de prueba proporcionado en el portal.');
 const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
 const sha=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 if(sha!==fixtureHashes[kind])throw Error('Este PDF no se envió. Para probar el sistema, usa el documento ficticio incorporado. No adjuntes documentos personales.');
 return fileData(file);
}
function fixtureLink(kind,text){const link=node('a',text);link.href='./pilot-fixtures/'+kind+'.pdf';link.download=kind+'-prueba.pdf';return link;}

// Populate the actual file input with the bundled, verified synthetic PDF.
// No user document is uploaded or replaced without an explicit click.
function fixtureAttach(kind,input,label,onReady){
 const b=button(label,async()=>{
  b.disabled=true;const previous=b.textContent;b.textContent='Preparando PDF…';
  try{
   const response=await fetch('./pilot-fixtures/'+kind+'.pdf',{cache:'no-store'});
   if(!response.ok)throw Error('No se pudo cargar el PDF de prueba.');
   const file=new File([await response.blob()],kind+'-prueba.pdf',{type:'application/pdf'});
   await fixtureFile(file,kind);
   const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;
   input.dispatchEvent(new Event('change',{bubbles:true}));
   if(onReady)onReady();
   b.textContent='PDF de prueba adjuntado';
  }catch(e){b.textContent=previous;const target=input.closest('#details')?'adminError':input.closest('#trackingList')?'trackingError':'formError';displayError(target,e);}
  finally{b.disabled=false;}
 },'secondary');
 return b;
}

async function invoke(name,data={}){
 if(!api||!user)throw Error('Inicia sesión con una cuenta habilitada.');
 const idToken=await user.getIdToken(),appCheck=(await api.check.getLimitedUseToken(api.appCheck)).token;
 const res=await fetch(api.endpoint,{method:'POST',body:new URLSearchParams({probe:'spark-pilot-v1',idToken,appCheck,payload:JSON.stringify({action:name,data})}),credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(110000)});
 if(!res.ok)throw Error('Backend HTTP '+res.status);
 const r=await res.json();
 if(r.build!=='spark-unified-2.0')throw Error('La URL todavía utiliza una versión anterior de Recepción. Actualiza la implementación existente.');
 if(r.ok!==true)throw Error('Operación rechazada: '+(r.error||'sin detalle')+' · '+(r.stage||'backend'));
 return r.data;
}
form.addEventListener('submit',async e=>{e.preventDefault();if(stage!==2||!validStep(2))return;const b=$('submit');b.disabled=true;const submitLabel=b.textContent;b.textContent='Enviando solicitud…';msg('formError');try{let result;if(demo){result={id:crypto.randomUUID(),radicado:'DEMO-'+Date.now(),status:'received'};demoItems.unshift({...result,name:'Persona de prueba',createdAt:Date.now(),files:[]});}else{if(!user||!authorized)throw Error('Verifica tu cuenta habilitada.');const d=Object.fromEntries(new FormData(form));const files=[await fixtureFile(form.history.files[0],'historia')];if(form.extra.files[0])files.push(await fixtureFile(form.extra.files[0],'apoyo'));requestKey??=crypto.randomUUID();result=await invoke('submitRequest',{legalDecisions:experience.decisions(),key:requestKey,name:d.name,documentType:d.documentType,documentNumber:d.documentNumber,phone:d.phone,zone:d.zone,representation:d.representation,support:d.support,files,consent:true,synthetic:true,noticeVersion:'pilot-v1'});}
hide(form);hide($('receipt'),false);msg('receiptId',result.radicado);msg('receiptTitle',result.status==='received'?'Solicitud de prueba registrada':'Solicitud pendiente de verificación');msg('receiptText',demo?'Demostración local. No se enviaron datos ni se creó ningún expediente oficial.':(result.status==='received'?'Puedes consultar el estado desde tu correo verificado. No es un radicado oficial.':'Salud debe verificar el almacenamiento antes de continuar.'));resetProfile();requestKey=null;experience.toast('Consulta el estado de la solicitud en Seguimiento.');
}catch(err){displayError('formError',err);if(err.message.includes('legal_version_changed'))void experience.prepare(user).catch(e=>displayError('formError',e));}finally{b.disabled=false;b.textContent=submitLabel}});
function badge(s){const chip=node('span',statusNames[s]||s,'chip');chip.dataset.state=s;return chip}
function date(t){return t?new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short'}).format(new Date(t)):'Sin fecha'}
function downloadContent(f,kind){const a=document.createElement('a'),bytes=Uint8Array.from(atob(f.base64),v=>v.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));a.href=url;a.download=kind+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
async function download(id,kind){downloadContent(await invoke('downloadFile',{id,kind}),kind);}
async function fixtureData(kind){
 const response=await fetch('./pilot-fixtures/'+kind+'.pdf',{cache:'no-store'});
 if(!response.ok)throw Error('No se pudo cargar el archivo de prueba.');
 return fixtureFile(new File([await response.blob()],kind+'.pdf',{type:'application/pdf'}),kind);
}
const documentNames={historia:'soporte principal',apoyo:'anexo de apoyo'};
function correctionForm(item){
 const wrapper=node('div',undefined,'detail-actions'), kind=item.correctionKind;
 const label=node('label','Selecciona el '+documentNames[kind]+' de prueba'), file=node('input');
 file.type='file';file.accept='.pdf,application/pdf';label.append(file);
 const send=button('Enviar subsanación',async()=>{
  send.disabled=true;msg('trackingError');
  try{await invoke('submitCorrection',{id:item.id,file:await fixtureFile(file.files[0],kind)});await loadTracking();}
  catch(e){displayError('trackingError',e);}
  finally{send.disabled=false;}
 },'primary');
 append(wrapper,node('p','Salud solicita actualizar el '+documentNames[kind]+'.'),fixtureAttach(kind,file,'Adjuntar PDF ficticio'),fixtureLink(kind,'Descargar el PDF requerido'),label,send);
 return wrapper;
}
async function loadTracking(){const session=user;const target=$('trackingList');target.replaceChildren();msg('trackingError');try{let data;if(demo){msg('trackingInfo','Vista de prueba local; no utiliza expedientes reales.');data=demoItems;}else if(!user||!authorized){msg('trackingInfo','Identifícate con el correo asociado para consultar tus solicitudes.');return}else{msg('trackingInfo','Solicitudes asociadas a tu correo verificado.');experience.loading(target);data=(await invoke('myRequests')).items;if(user!==session)return;target.replaceChildren();}if(!data.length){target.append(node('p','Aún no hay solicitudes.','muted'));return}for(const item of data){const card=node('div',undefined,'record');append(card,node('strong',item.radicado),node('small',date(item.createdAt)),badge(item.status));if(item.correctionKind&&!demo)card.append(correctionForm(item));if(item.certificateAvailable&&!demo)card.append(button('Descargar certificado',async()=>{try{await download(item.id,'certificate')}catch(e){if(user===session){target.replaceChildren();displayError('trackingError',e);}}}));target.append(card)}}catch(e){if(user===session){target.replaceChildren();displayError('trackingError',e);}}}
$('refreshTracking').onclick=loadTracking;
const sample=[{id:'demo01',radicado:'DEMO-0001',name:'Persona de prueba',email:'prueba@example.invalid',documentType:'CC',documentNumber:'TEST001',zone:'Cabecera municipal',status:'received',createdAt:Date.now(),files:[]},{id:'demo02',radicado:'DEMO-0002',name:'Expediente simulado',email:'ejemplo@example.invalid',documentType:'CC',documentNumber:'TEST002',zone:'Zona rural dispersa',status:'awaiting_certificate',createdAt:Date.now()-86400000,files:[]}];
function renderAdmin(){const q=$('search').value.toLowerCase().trim(), status=$('statusFilter').value, list=$('adminList');list.replaceChildren();msg('total',String(adminItems.length));msg('pending',String(adminItems.filter(x=>['received','reviewing'].includes(x.status)).length));msg('sent',String(adminItems.filter(x=>x.status==='sent').length));for(const item of adminItems.filter(x=>(!status||x.status===status)&&(x.radicado+' '+x.name).toLowerCase().includes(q))){const b=button('',()=>details(item),'record');append(b,node('strong',item.radicado),node('span',item.name),node('small',date(item.createdAt)),badge(item.status));list.append(b)}if(!list.children.length)list.append(node('p','Sin coincidencias.','muted'))}
$('search').oninput=renderAdmin;
for(const [value,label] of Object.entries(statusNames)){
 const option=node('option',label);option.value=value;$('statusFilter').append(option);
}
$('statusFilter').onchange=renderAdmin;
const actionNames={created:'Solicitud registrada',received:'Soportes recibidos',delivery_requested:'Entrega solicitada',notification_sent:'Notificación enviada',archived:'Certificado archivado'};
async function loadHistory(item,target){
 try{
  const {items}=await invoke('adminHistory',{id:item.id});
  const list=node('ol');
  for(const event of items){
   const [verb,value]=event.action.split(':');
   const text=verb==='status'?'Cambio de estado: '+(statusNames[value]||value)
    :verb==='correction_requested'?'Subsanación solicitada: '+documentNames[value]
    :verb==='correction_received'?'Subsanación recibida: '+documentNames[value]
    :verb==='download'?'Descarga: '+value:actionNames[event.action]||event.action;
   list.append(node('li',text+' · '+date(event.at)+' · Cuenta '+event.actorUid));
  }
  target.replaceChildren(items.length?list:node('p','Sin actuaciones registradas.','muted'));
 }catch(e){target.replaceChildren(node('p','No se pudo consultar el historial.','error'));}
}
async function loadAdmin(){const session=user;hide($('adminDashboard'));hide($('adminLogin'),false);msg('loginError');try{if(demo){adminItems=[...demoItems,...sample];}else if(!user||!authorized){return;}else{const result=await invoke('adminList');if(user!==session)return;adminItems=result.items;adminRole=result.role;workspaceMode(currentView==='admin'&&!!adminRole);hide($('adminNav'),false);}hide($('adminLogin'));hide($('adminDashboard'),false);if(adminRole&&currentView==='admin'){const m=$('adminDashboard').querySelector('.admin-module-nav');if(m)m.open=true;}renderAdmin();if(selected){const item=adminItems.find(x=>x.id===selected);if(item)details(item)}}catch(e){if(user!==session)return;adminItems=[];selected=null;adminRole=null;workspaceMode(false);if(!demo)hide($('adminNav'));$('adminList').replaceChildren();$('details').replaceChildren(node('p','Selecciona una solicitud.','muted'));msg('loginError','Acceso restringido al personal institucional autorizado.');}}
$('refreshAdmin').onclick=loadAdmin;
function details(item){selected=item.id;const target=$('details');target.replaceChildren();append(target,node('h2','Detalle del expediente'),node('p',item.radicado,'muted'),badge(item.status));const dl=node('dl',undefined,'summary');for(const [k,v] of [['Nombre',item.name],['Documento',item.documentType+' '+item.documentNumber],['Correo verificado',item.email],['Zona',item.zone],['Teléfono',item.phone],['Ajustes',item.support]]){const p=node('div');append(p,node('dt',k),node('dd',v||'No informado'));dl.append(p)}target.append(dl,node('h2','Documentos'));const actions=node('div',undefined,'detail-actions');for(const f of item.files||[])actions.append(button('Descargar '+f.kind,async()=>{try{await download(item.id,f.kind)}catch(e){displayError('adminError',e)}}));if(!item.files?.length)actions.append(node('p','Sin soportes visibles en esta prueba.','muted'));if(item.certificate)actions.append(button('Descargar certificado archivado',async()=>{try{await download(item.id,'certificate')}catch(e){displayError('adminError',e)}}));const next={received:[['reviewing','Iniciar revisión']],reviewing:[['awaiting_certificate','Marcar pendiente de certificado']],needs_documents:[['reviewing','Retomar revisión']]}[item.status]||[];for(const [s,label] of next)actions.append(button(label,async()=>{try{if(demo)item.status=s;else await invoke('setStatus',{id:item.id,status:s});await loadAdmin()}catch(e){displayError('adminError',e)}}));if(item.status==='reviewing'){
 const label=node('label','Soporte para subsanar'), select=node('select');
 for(const [value,text] of Object.entries(documentNames)){const option=node('option',text);option.value=value;select.append(option);}
 label.append(select);
 const request=button('Solicitar subsanación',async()=>{
  request.disabled=true;msg('adminError');
  try{
   if(demo){item.status='needs_documents';item.correctionKind=select.value;}
   else await invoke('setStatus',{id:item.id,status:'needs_documents',documentKind:select.value});
   await loadAdmin();
  }catch(e){displayError('adminError',e);}
  finally{request.disabled=false;}
 });
 append(actions,label,request);
}if(item.status==='needs_documents'&&item.correctionKind)actions.append(node('p','Pendiente de subsanar el '+documentNames[item.correctionKind]+'.'));
if(item.status==='awaiting_certificate'&&(demo||adminRole==='supervisor')){const title=node('h2','Entrega del certificado de prueba'),label=node('label','Seleccionar PDF de prueba'),file=node('input');file.type='file';file.accept='.pdf,application/pdf';label.append(file);const confirm=node('label',undefined,'check'),check=node('input');check.type='checkbox';append(confirm,check,node('span','Verifiqué que el documento corresponde a la persona y al expediente.'));const send=button('Archivar y notificar por correo',async()=>{msg('adminError');try{if(!check.checked||(!demo&&!file.files[0]))throw Error('Selecciona el certificado y confirma la revisión.');if(demo){item.status='sent';await loadAdmin();return;}if(file.files[0].size>5*1024*1024)throw Error('El archivo supera 5 MB.');send.disabled=true;const result=await invoke('sendCertificate',{id:item.id,file:await fixtureFile(file.files[0],'certificate'),confirm:true});await loadAdmin();if(result.status!=='sent')msg('adminError','Requiere revisión de entrega. No reenvíe automáticamente.');}catch(e){displayError('adminError',e)}finally{send.disabled=false}},'primary');append(actions,title,...(demo?[]:[fixtureAttach('certificate',file,'Adjuntar certificado ficticio')]),fixtureLink('certificate','Descargar PDF de certificado ficticio'),label,confirm,send)}if(['storage_review','delivery_review','sending','saving','archived'].includes(item.status))actions.append(node('p','Este expediente requiere conciliación manual. No repita el envío sin revisar.','muted'));target.append(actions);if(!demo){const history=node('div');target.append(node('h2','Historial de actuaciones'),history);history.append(node('p','Cargando actuaciones…','muted'));void loadHistory(item,history);}}
function resetProfile(){
 form.reset();
 form.elements.name.value='Persona de prueba';
 form.documentType.value='CC';
 form.documentNumber.value='TEST001';
 form.zone.value='Cabecera municipal';
}
async function syncAccess(session){
 if(!session?.emailVerified){hide($('adminNav'));return;}
 try{
  const access=await invoke('sessionAccess');
  if(user!==session)return;
  adminRole=access.canManage?access.role:null;
  hide($('adminNav'),!access.canManage);
 }catch(e){if(user===session){adminRole=null;hide($('adminNav'));}}
}
async function init(){resetProfile();if(demo){$('institutionalAccess').textContent='Demostración del panel de Salud';$('googleLogin').textContent='Ver panel de demostración';$('googleLogin').onclick=loadAdmin;return}for (const field of ['name','documentNumber','phone','support']) form.elements[field].readOnly=true;
 for (const option of form.documentType.options) option.disabled=option.value!=='CC';
 const fixturePanel=$('fixtureFiles');fixturePanel.replaceChildren();
 const attach=fixtureAttach('historia',form.history,'Adjuntar PDF ficticio obligatorio',()=>msg('formError'));
 const attachExtra=fixtureAttach('apoyo',form.extra,'Adjuntar anexo ficticio (opcional)',()=>msg('formError'));
 fixturePanel.append(node('strong','Documentos de prueba disponibles'),node('span','Haz clic para adjuntarlos directamente. No necesitas descargar ni buscar archivos.'),attach,attachExtra,fixtureLink('historia','Descargar PDF ficticio'));
 fixturePanel.classList.add('fixture-panel');
 hide($('fixtureFiles'),false);
 hide(form);hide($('authCitizen'),false);$('googleLogin').disabled=true;experience.connection('loading');
const endpoint='https://script.google.com/macros/s/AKfycbyyh3-X79k-EP___nUAgmwCDkGZvpmxTVkuE8NGburWvXxwjZod3DrPikZPuB1KWKxz/exec';
void catalog.connect(endpoint);void experience.publicEndpoint(endpoint);void officialUI.connect(endpoint);
try{
const version='11.10.0';const [app,auth,check]=await Promise.all([import('https://www.gstatic.com/firebasejs/'+version+'/firebase-app.js'),import('https://www.gstatic.com/firebasejs/'+version+'/firebase-auth.js'),import('https://www.gstatic.com/firebasejs/'+version+'/firebase-app-check.js')]);
const a=app.initializeApp(config.firebase),au=auth.getAuth(a),appCheck=check.initializeAppCheck(a,{provider:new check.ReCaptchaEnterpriseProvider(config.appCheckSiteKey),isTokenAutoRefreshEnabled:false});
await auth.setPersistence(au,auth.browserSessionPersistence);
api={check,appCheck,endpoint};
$('emailForm').hidden=true;
const citizenLogin=button('Ingresar con Google',async()=>login(false),'primary');
$('authCitizen').querySelector('h2').textContent='Ingresa a SITS Salud';
$('authCitizen').querySelector('p').textContent='Ingresa con tu cuenta de Google. Si es tu primera visita, tu acceso ciudadano se registrará cuando el servicio de registro esté habilitado.';
$('authCitizen').insertBefore(citizenLogin,$('authMessage'));
const healthResponse=await fetch(api.endpoint+'?v=2.0',{credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});
if(!healthResponse.ok)throw Error('Recepción HTTP '+healthResponse.status);
const health=await healthResponse.json();
if(health.build!=='spark-unified-2.0')throw Error('Recepción aún utiliza una versión anterior. No se han enviado archivos.');
if(health.enabled!==true)throw Error('El servicio de recepción no está disponible temporalmente.');
experience.connection('ready');
async function login(admin,propagate=false){try{const p=new auth.GoogleAuthProvider();p.setCustomParameters({prompt:'select_account',...(admin?{hd:'sanpedro-valle.gov.co'}:{})});await auth.signInWithPopup(au,p);}catch(err){const message='No se pudo iniciar sesión: '+(err.code||'verifica la cuenta');msg(admin?'loginError':'authMessage',message);if(propagate)throw Error(message);}}
trackingLogin=()=>login(false,true);
$('googleLogin').disabled=false;$('googleLogin').onclick=()=>login(true);$('signout').onclick=()=>auth.signOut(au);
auth.onAuthStateChanged(au,async u=>{
 user=u;experience.setSession(null,null);catalog.setSession(null,null);authorized=false;clearWorkspace();officialUI.session(false);if(!demo)trackingGate.session(false);hide($('signout'),!u);hide($('authCitizen'),false);hide(form);resetProfile();requestKey=null;phase(0);hide($('receipt'));$('details').replaceChildren(node('p','Selecciona un expediente.','muted'));adminItems=[];selected=null;adminRole=null;hide($('adminNav'));hide($('adminDashboard'));hide($('adminLogin'),false);$('adminList').replaceChildren();$('trackingList').replaceChildren();
 if(!u){msg('authMessage','');return;}
 msg('authMessage','Validando cuenta…');
 try{const access=await invoke('sessionAccess');if(user!==u)return;authorized=true;officialUI.session(true);trackingGate.session(true);adminRole=access.canManage?access.role:null;experience.setSession(u,adminRole,access.institutional===true);catalog.setSession(u,adminRole);await experience.prepare(u);if(user!==u)return;hide($('authCitizen'));if(labMode)hide(form,false);hide($('adminNav'),!access.canManage);if(adminRole){showView('admin');}else if(currentView==='admin')await loadAdmin();if(currentView==='tracking'){await loadTracking();void catalog.tracking();}}
 catch(e){if(user!==u)return;msg('authMessage',e.message.includes('not_enabled')?'Tu acceso aún no está habilitado en el servicio. Consulta con Salud si el problema persiste.':e.message);msg('loginError',e.message);}
});
}catch(e){experience.connection('failed');msg('authMessage',e.message||'No fue posible conectar con Recepción.');msg('loginError',e.message||'Recepción no disponible.');}}
phase(0);
const initial=location.hash.slice(1);
if(['legal','communications','catalog','citizen','tracking','admin'].includes(initial))showView(initial);
else if(!demo)showView(location.pathname.endsWith('/pilot.html')?'citizen':'catalog');
void init();
