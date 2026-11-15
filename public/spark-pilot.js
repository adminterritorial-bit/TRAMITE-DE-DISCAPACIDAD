import {config} from './config.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,setPersistence,inMemoryPersistence,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {initializeAppCheck,ReCaptchaEnterpriseProvider,getLimitedUseToken} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app-check.js';
const $=id=>document.getElementById(id);
const app=initializeApp(config.firebase,'spark-operational');
const auth=getAuth(app),check=initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(config.appCheckSiteKey),isTokenAutoRefreshEnabled:false});
const expected='80ac944b3abbd5dc1e884c7911acfd6b4c75395c5da4e41bc2077a9908800612';
let target=null,user=null,role=null,busy=false,requestKey=null;
const status=s=>$('status').textContent=s;
const controls=()=>{for(const id of ['submit','mine','refresh','logout'])$(id).disabled=busy||!user;$('login').disabled=busy||!!user;$('endpoint').disabled=busy||!!user;$('admin').hidden=!role;};
async function endpoint(){
 const raw=$('endpoint').value.trim();
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(raw))throw Error('URL incompleta.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
 if(Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')!==expected)throw Error('La URL no corresponde a Recepción.');
 return raw;
}
async function api(action,data={}){
 if(!user||!target)throw Error('Inicia sesión.');
 const idToken=await user.getIdToken();
 const appCheck=(await getLimitedUseToken(check)).token;
 const response=await fetch(target,{method:'POST',body:new URLSearchParams({probe:'spark-pilot-v1',appCheck,idToken,payload:JSON.stringify({action,data})}),credentials:'omit',redirect:'follow',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw Error('HTTP '+response.status);
 const r=await response.json();
 if(r.ok!==true)throw Error(r.error||'No se pudo completar la operación.');
 return r.data;
}
const names={saving:'Guardando',received:'Recibida',reviewing:'En revisión',awaiting_certificate:'Pendiente de certificado',storage_review:'Revisión de almacenamiento'};
function textNode(tag,text){const x=document.createElement(tag);x.textContent=text;return x;}
function actionButton(label,fn){const b=textNode('button',label);b.onclick=()=>run(fn);return b;}
function render(items,targetId,admin=false){
 const root=$(targetId);root.replaceChildren();
 if(!items.length)root.append(textNode('p','Sin solicitudes.'));
 for(const item of items){
  const row=textNode('article','');row.append(textNode('strong',item.radicado),textNode('p',names[item.status]||item.status));
  if(admin){
   const next={received:'reviewing',reviewing:'awaiting_certificate'}[item.status];
   if(next)row.append(actionButton(next==='reviewing'?'Iniciar revisión':'Marcar pendiente de certificado',async()=>{await api('setStatus',{id:item.id,status:next});await loadAdmin();}));
   row.append(actionButton('Ver historial',async()=>{$('history').textContent=(await api('adminHistory',{id:item.id})).items.map(x=>new Date(x.at).toLocaleString('es-CO')+' · '+x.action).join('\n');}));
  }
  root.append(row);
 }
}
async function loadMine(){render((await api('myRequests')).items,'myList');}
async function loadAdmin(){render((await api('adminList')).items,'records',true);}
async function run(fn){
 if(busy)return;busy=true;controls();status('Procesando…');
 try{await fn();status('Operación completada.');}catch(e){status('No se completó: '+String(e.code||e.message).slice(0,150));}
 finally{busy=false;controls();}
}
$('login').onclick=()=>run(async()=>{
 target=await endpoint();
 const p=new GoogleAuthProvider();p.setCustomParameters({prompt:'select_account',hd:'sanpedro-valle.gov.co'});
 try{user=(await signInWithPopup(auth,p)).user;const a=await api('sessionAccess');role=a.canManage?a.role:null;await loadMine();if(role)await loadAdmin();}
 catch(e){await signOut(auth).catch(()=>{});user=null;role=null;target=null;throw e;}
});
$('logout').onclick=()=>run(async()=>{await signOut(auth);user=null;role=null;target=null;requestKey=null;for(const id of ['myList','records','history'])$(id).replaceChildren();});
$('mine').onclick=()=>run(loadMine);
$('refresh').onclick=()=>run(loadAdmin);
$('submit').onclick=()=>run(async()=>{
 if(!$('consent').checked)throw Error('Confirma el uso de datos ficticios.');
 if(!requestKey)requestKey=crypto.randomUUID();
 const r=await fetch('./pilot-fixtures/historia.pdf',{cache:'no-store'});if(!r.ok)throw Error('PDF de prueba no disponible.');
 const bytes=new Uint8Array(await r.arrayBuffer());let s='';for(const b of bytes)s+=String.fromCharCode(b);
 await api('submitRequest',{key:requestKey,base64:btoa(s),synthetic:true,consent:true,noticeVersion:'pilot-v1'});
 requestKey=null;$('consent').checked=false;await loadMine();if(role)await loadAdmin();
});
try{await setPersistence(auth,inMemoryPersistence);controls();status('Introduce la URL de Recepción e inicia sesión.');}catch(_){status('No se pudo inicializar la sesión.');}
