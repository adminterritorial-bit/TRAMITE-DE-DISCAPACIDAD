import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineBoolean, defineString } from 'firebase-functions/params';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { fixtureAllowed, profileAllowed, citizenMayDownload } from './pilot-safety.js';
initializeApp();
const db=getFirestore();
const pilot=defineBoolean('ENABLE_PILOT',{default:false});
const portal=defineString('PORTAL_URL',{default:'https://tramite-discapacidad.web.app/'});
const archiveUrl=defineSecret('ARCHIVE_URL'), archiveKey=defineSecret('ARCHIVE_KEY');
const deliveryUrl=defineSecret('DELIVERY_URL'), deliveryKey=defineSecret('DELIVERY_KEY');
const opts={region:'us-central1',enforceAppCheck:true,maxInstances:3,timeoutSeconds:120,memory:'512MiB',secrets:[archiveUrl,archiveKey,deliveryUrl,deliveryKey]};
const fail=(code='failed-precondition',msg='No se pudo completar la operación. Contacte a Salud.')=>{throw new HttpsError(code,msg)};
const hash=x=>createHash('sha256').update(x).digest('hex');
const idPattern=/^[a-f0-9]{64}$/;
function str(x,n,min=1){if(typeof x!=='string'||x.trim().length<min||x.trim().length>n||/[\x00-\x1F\x7F]/.test(x))fail('invalid-argument','Revise los campos de la solicitud.');return x.trim()}
function pdf(x,kind){if(!x||typeof x.base64!=='string'||x.base64.length>7000000||! /^[A-Za-z0-9+/]+={0,2}$/.test(x.base64))fail('invalid-argument','Adjunte un PDF de hasta 5 MB.');const b=Buffer.from(x.base64,'base64');if(b.length>5*1024*1024||b.length<20||b.subarray(0,5).toString()!=='%PDF-'||!b.subarray(-2048).includes(Buffer.from('%%EOF')))fail('invalid-argument','El documento no parece un PDF válido.');return {kind,base64:b.toString('base64'),sha:hash(b),size:b.length};}
function id(x){if(typeof x!=='string'||!idPattern.test(x))fail('invalid-argument');return x}
async function identity(r,admin=false){if(!pilot.value())fail('failed-precondition','Servicio aún no habilitado.');if(!r.auth?.uid||r.auth.token.email_verified!==true)fail('unauthenticated','Verifique su correo electrónico.');const u=await getAuth().getUser(r.auth.uid);if(u.disabled||!u.emailVerified||!u.email||u.email!==r.auth.token.email||Date.parse(u.tokensValidAfterTime||0)>Number(r.auth.token.auth_time)*1000+999)fail('unauthenticated','Inicie sesión nuevamente.');const access=(await db.doc('users/'+u.uid).get()).data();if(access?.active!==true)fail('permission-denied','Cuenta no habilitada para este piloto.');if(admin){const a=(await db.doc('admins/'+u.uid).get()).data();if(r.auth.token.firebase?.sign_in_provider!=='google.com'||!u.email.toLowerCase().endsWith('@sanpedro-valle.gov.co')||a?.active!==true||!['operator','admin','supervisor'].includes(a.role)||a.email!==u.email)fail('permission-denied','Esta cuenta no está autorizada.');return {...u,role:a.role,uid:u.uid,email:u.email};}return u}
async function throttle(uid,action,max){const day=new Date().toISOString().slice(0,10),ref=db.doc('rateLimits/'+hash(uid+':'+action+':'+day));await db.runTransaction(async t=>{const old=(await t.get(ref)).data()?.count||0;if(old>=max)fail('resource-exhausted','Límite temporal alcanzado.');t.set(ref,{count:old+1,expiresAt:new Date(Date.now()+48*3600000)});});}
async function bridge(which,action,data){const url=(which==='archive'?archiveUrl:deliveryUrl).value(),key=(which==='archive'?archiveKey:deliveryKey).value();if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)||key.length<43)fail();const body=JSON.stringify({action,data}),ts=Date.now(),nonce=randomUUID(),mac=createHmac('sha256',key).update(ts+'.'+nonce+'.'+body).digest('hex');const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ts,nonce,body,mac}),redirect:'follow',signal:AbortSignal.timeout(90000)});if(!response.ok)throw Error('bridge');const result=await response.json();if(result.ok!==true)throw Error('bridge');return result.data;}
function audit(t,requestId,uid,action){t.create(db.collection('audit').doc(),{requestId,actorUid:uid,action,at:FieldValue.serverTimestamp()});}
function record(s,admin){const d=s.data();return {id:s.id,radicado:d.radicado,status:d.status,createdAt:d.createdAt?.toMillis()||0,updatedAt:d.updatedAt?.toMillis()||0,correctionKind:d.status==='needs_documents'?d.correction?.kind||null:null,...(admin?{name:d.name,email:d.email,documentType:d.documentType,documentNumber:d.documentNumber,phone:d.phone,zone:d.zone,representation:d.representation,support:d.support||'',files:d.files||[],certificate:d.certificate||null}: {certificateAvailable:!!d.certificate&&['sent','delivery_review','archived'].includes(d.status)})};}
export const submitRequest=onCall(opts,async r=>{
 const u=await identity(r),d=r.data||{};
 const key=str(d.key,36);if(!/^[a-f0-9-]{36}$/i.test(key))fail('invalid-argument');
 if(d.consent!==true||d.noticeVersion!=='pilot-v1'||d.synthetic!==true)fail('invalid-argument','Confirme las condiciones de la prueba.');
 const name=str(d.name,120),documentType=str(d.documentType,6),documentNumber=str(d.documentNumber,25),phone=str(d.phone,25,0),zone=str(d.zone,80),representation=str(d.representation,20),support=str(d.support||'',300,0);
 if(!['CC','TI','RC','CE','PA','OTRO'].includes(documentType)||! /^[A-Za-z0-9-]{3,25}$/.test(documentNumber)||!['propia','apoyo'].includes(representation))fail('invalid-argument');
 if(!Array.isArray(d.files)||d.files.length<1||d.files.length>2)fail('invalid-argument','Adjunte los soportes PDF.');
 const files=d.files.map((f,i)=>pdf(f,i===0?'historia':'apoyo'));
 if (!profileAllowed({name,documentType,documentNumber,phone,zone,representation,support}) || !files.every(fixtureAllowed)) {
   fail('invalid-argument','Usa el perfil y los PDF de prueba proporcionados en el portal.');
 }
 const requestId=hash(u.uid+':'+key),ref=db.doc('requests/'+requestId),radicado='SP-PIL-'+requestId.slice(0,16).toUpperCase();
 const prior=await ref.get();if(prior.exists)return {id:requestId,radicado,status:prior.data().status};
 await throttle(u.uid,'submit',3);
 const created=await db.runTransaction(async t=>{if((await t.get(ref)).exists)return false;t.create(ref,{ownerUid:u.uid,name,documentType,documentNumber,phone,zone,representation,support,email:u.email,consent:true,noticeVersion:'pilot-v1',synthetic:true,radicado,status:'saving',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});audit(t,requestId,u.uid,'created');return true;});
 if(!created)return {id:requestId,radicado,status:(await ref.get()).data().status};
 try{const saved=await bridge('archive','save',{requestId,files});await db.runTransaction(async t=>{t.update(ref,{files:saved.files,status:'received',updatedAt:FieldValue.serverTimestamp()});audit(t,requestId,u.uid,'received');});try{const ack=await bridge('archive','ack',{requestId,radicado,email:u.email,portal:portal.value()});await ref.update({ackStatus:ack.sent?'sent':'pending'});}catch{await ref.update({ackStatus:'review'}).catch(()=>{});}return {id:requestId,radicado,status:'received'};}catch{await ref.update({status:'storage_review',updatedAt:FieldValue.serverTimestamp()});return {id:requestId,radicado,status:'storage_review'};}
});
// Server-authoritative capability discovery; no dossier data or role writes.
export const sessionAccess=onCall(opts,async r=>{
 const u=await identity(r);
 try{const a=await identity(r,true);return {role:a.role,canManage:true,canDeliver:a.role==='supervisor'};}
 catch(e){if(e.code==='permission-denied')return {role:null,canManage:false,canDeliver:false};throw e;}
});
export const myRequests=onCall(opts,async r=>{const u=await identity(r);await throttle(u.uid,'list',150);const s=await db.collection('requests').where('ownerUid','==',u.uid).orderBy('createdAt','desc').limit(100).get();return {items:s.docs.map(x=>record(x,false))}});
export const adminList=onCall(opts,async r=>{const u=await identity(r,true);await throttle(u.uid,'adminList',300);const s=await db.collection('requests').orderBy('createdAt','desc').limit(100).get();return {items:s.docs.map(x=>record(x,true)),role:u.role}});
export const adminHistory=onCall(opts,async r=>{
 const u=await identity(r,true),requestId=id(r.data?.id);
 await throttle(u.uid,'adminHistory',300);
 const events=await db.collection('audit').where('requestId','==',requestId).orderBy('at','desc').limit(50).get();
 return {items:events.docs.map(doc=>{
   const event=doc.data();
   return {action:event.action,actorUid:event.actorUid,at:event.at?.toMillis()||0};
 })};
});
export const setStatus=onCall(opts,async r=>{
 const u=await identity(r,true),d=r.data||{},ref=db.doc('requests/'+id(d.id));
 const allowed={received:['reviewing'],reviewing:['needs_documents','awaiting_certificate'],needs_documents:['reviewing']};
 const isCorrection=d.status==='needs_documents';
 if(isCorrection&&!['historia','apoyo'].includes(d.documentKind))fail('invalid-argument','Selecciona el soporte para subsanar.');
 const correction=isCorrection?{kind:d.documentKind,id:randomUUID()}:FieldValue.delete();
 await db.runTransaction(async t=>{
   const s=await t.get(ref);
   if(!s.exists)fail('not-found');
   if(!allowed[s.data().status]?.includes(d.status))fail('failed-precondition','Transición no permitida.');
   t.update(ref,{status:d.status,correction,updatedAt:FieldValue.serverTimestamp()});
   audit(t,ref.id,u.uid,isCorrection?'correction_requested:'+d.documentKind:'status:'+d.status);
 });
 return {ok:true};
});
export const submitCorrection=onCall(opts,async r=>{
 const u=await identity(r),d=r.data||{},ref=db.doc('requests/'+id(d.id));
 const entry=(await ref.get()).data();
 if(entry?.ownerUid!==u.uid)fail('not-found');
 if(entry.status!=='needs_documents'||!entry.correction?.kind)fail('failed-precondition','No hay una subsanación pendiente.');
 const file=pdf(d.file,entry.correction.kind);
 if(!fixtureAllowed(file))fail('invalid-argument','Usa el soporte de prueba indicado.');
 await throttle(u.uid,'correction',10);
 let saved;
 try{
   const result=await bridge('archive','save',{requestId:ref.id,files:[file]});
   saved=result.files?.[0];
   if(saved?.kind!==file.kind||saved.sha!==file.sha||typeof saved.fileId!=='string')throw Error('archive');
 }catch{fail('unavailable','No se pudo archivar el soporte. Inténtalo de nuevo.');}
 await db.runTransaction(async t=>{
   const current=(await t.get(ref)).data();
   if(current?.ownerUid!==u.uid)fail('not-found');
   if(current.status!=='needs_documents'||current.correction?.id!==entry.correction.id){
     fail('failed-precondition','La subsanación cambió. Actualiza el seguimiento.');
   }
   const files=(current.files||[]).filter(item=>item.kind!==saved.kind);
   files.push({kind:saved.kind,sha:saved.sha,size:file.size,fileId:saved.fileId});
   t.update(ref,{files,status:'reviewing',correction:FieldValue.delete(),updatedAt:FieldValue.serverTimestamp()});
   audit(t,ref.id,u.uid,'correction_received:'+file.kind);
 });
 return {status:'reviewing'};
});
export const downloadFile=onCall(opts,async r=>{const u=await identity(r),d=r.data||{},requestId=id(d.id),s=await db.doc('requests/'+requestId).get();const entry=s.data();let f;if(citizenMayDownload(entry,u.uid,d.kind)){f=entry.certificate;}else{try{await identity(r,true);}catch(e){if(e.code==='permission-denied')fail('not-found');throw e;}if(!entry)fail('not-found');f=d.kind==='certificate'?entry.certificate:entry.files?.find(x=>x.kind===d.kind);}if(!f||typeof f.fileId!=='string')fail('not-found');await throttle(u.uid,'download',100);const result=await bridge('archive','read',{requestId,fileId:f.fileId,sha:f.sha});await db.collection('audit').add({requestId,actorUid:u.uid,action:'download:'+d.kind,at:FieldValue.serverTimestamp()});return result;});
export const sendCertificate=onCall(opts,async r=>{
 const u=await identity(r,true);if(u.role!=='supervisor')fail('permission-denied');if(Date.now()/1000-Number(r.auth.token.auth_time)>900)fail('unauthenticated','Vuelva a iniciar sesión para efectuar el envío.');
 const d=r.data||{},ref=db.doc('requests/'+id(d.id)),file=pdf(d.file,'certificate');if(d.confirm!==true||!fixtureAllowed(file))fail('invalid-argument','Confirma la revisión y usa el certificado ficticio del piloto.');
 await throttle(u.uid,'send',30);const entry=await db.runTransaction(async t=>{const s=await t.get(ref);if(!s.exists)fail('not-found');const q=s.data();if(q.status!=='awaiting_certificate'||!q.consent)fail('failed-precondition','El expediente no está listo o el envío ya se intentó.');t.update(ref,{status:'sending',updatedAt:FieldValue.serverTimestamp()});audit(t,ref.id,u.uid,'delivery_requested');return q;});
 try{const sent=await bridge('delivery','deliver',{requestId:ref.id,radicado:entry.radicado,email:entry.email,portal:portal.value(),file});await db.runTransaction(async t=>{t.update(ref,{certificate:sent.certificate,status:sent.sent?'sent':'archived',updatedAt:FieldValue.serverTimestamp()});audit(t,ref.id,u.uid,sent.sent?'notification_sent':'archived');});return {status:sent.sent?'sent':'archived'};}catch{await ref.update({status:'delivery_review',updatedAt:FieldValue.serverTimestamp()});return {status:'delivery_review'};}
});
