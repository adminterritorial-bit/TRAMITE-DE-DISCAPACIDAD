import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';

const project = 'demo-discapacidad';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(authHost || '', /^127\.0\.0\.1:\d+$/);
assert.match(firestoreHost || '', /^127\.0\.0\.1:\d+$/);
assert.equal(process.env.GCLOUD_PROJECT, project);
process.env.ENABLE_PILOT = 'true';
process.env.ARCHIVE_URL = 'https://script.google.com/macros/s/syntheticArchive/exec';
process.env.DELIVERY_URL = 'https://script.google.com/macros/s/syntheticDelivery/exec';
const bridgeKey = 'local-only-synthetic-key-'.repeat(3);
process.env.ARCHIVE_KEY = bridgeKey;
process.env.DELIVERY_KEY = bridgeKey;

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const {getAuth} = require('firebase-admin/auth');
const {getFirestore} = require('firebase-admin/firestore');
const functions = await import('../functions/index.js');
const auth = getAuth();
const db = getFirestore();

const localFetch = globalThis.fetch;
const operations = [];
globalThis.fetch = async (url,options) => {
  if (!url.startsWith('https://script.google.com/macros/s/')) return localFetch(url,options);
  const {ts,nonce,body,mac} = JSON.parse(options.body);
  assert.equal(mac,createHmac('sha256',bridgeKey).update(ts+'.'+nonce+'.'+body).digest('hex'));
  const {action,data} = JSON.parse(body);
  operations.push(action);
  const metadata = ({kind,sha,size}) => ({kind,sha,size,fileId:'synthetic-'+kind});
  const result = action==='save'?{files:data.files.map(metadata)}
    :action==='deliver'?{certificate:metadata(data.file),sent:true}
    :action==='read'?fixture('certificate'):{sent:true};
  return Response.json({ok:true,data:result});
};

function fixture(kind) {
  const file = readFileSync(new URL('../public/pilot-fixtures/'+kind+'.pdf',import.meta.url));
  return {base64:file.toString('base64')};
}

async function participant(role) {
  const email = randomUUID()+'@'+(role?'sanpedro-valle.gov.co':'example.invalid');
  const password = randomUUID();
  const {uid} = await auth.createUser({email,password,emailVerified:true});
  const response = await localFetch('http://'+authHost+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})
  });
  assert.equal(response.ok,true);
  const {idToken} = await response.json();
  const token = await auth.verifyIdToken(idToken);
  await db.doc('pilotUsers/'+uid).set({active:true});
  if (role) {
    await db.doc('admins/'+uid).set({email,active:true,role});
    token.firebase.sign_in_provider = 'google.com';
  }
  return {uid,token,idToken};
}

const call = (name,auth,data={}) => functions[name].run({auth,data});
const denied = (promise,code) => assert.rejects(promise,error=>error.code===code);

test('closed pilot enforces Firestore rules, ownership, roles, and its document flow',async()=>{
  const [owner,other,operator,supervisor] = await Promise.all([
    participant(),participant(),participant('operator'),participant('supervisor')
  ]);
  const draft = {key:randomUUID(),name:'Persona de prueba',documentType:'CC',documentNumber:'TEST001',
    phone:'',zone:'Cabecera municipal',representation:'propia',support:'',
    files:[fixture('historia')],consent:true,synthetic:true,noticeVersion:'pilot-v1'};
  await denied(call('myRequests',undefined),'unauthenticated');
  await denied(call('myRequests',{...owner,token:{...owner.token,email_verified:false}}),'unauthenticated');
  await denied(call('submitRequest',owner,{...draft,documentNumber:'12345678'}),'invalid-argument');
  await denied(call('submitRequest',owner,{...draft,files:[fixture('certificate')]}),'invalid-argument');
  const created = await call('submitRequest',owner,draft);
  assert.equal(created.status,'received');
  assert.deepEqual(await call('submitRequest',owner,draft),created);
  assert.deepEqual(operations,['save','ack']);
  const request = {id:created.id};
  const firestoreUrl = 'http://'+firestoreHost+'/v1/projects/'+project+'/databases/(default)/documents/requests/'+created.id;
  for (const method of ['GET','DELETE']) {
    const forbidden = await localFetch(firestoreUrl,{method,headers:{Authorization:'Bearer '+owner.idToken}});
    assert.equal(forbidden.status,403);
  }
  assert.equal((await call('myRequests',owner)).items.length,1);
  assert.deepEqual((await call('myRequests',other)).items,[]);
  await denied(call('adminList',owner),'permission-denied');
  await denied(call('adminHistory',other,request),'permission-denied');
  await denied(call('setStatus',operator,{...request,status:'awaiting_certificate'}),'failed-precondition');
  await call('setStatus',operator,{...request,status:'reviewing'});
  await denied(call('setStatus',operator,{...request,status:'needs_documents',documentKind:'arbitrary'}),'invalid-argument');
  await call('setStatus',operator,{...request,status:'needs_documents',documentKind:'apoyo'});
  assert.equal((await call('myRequests',owner)).items[0].correctionKind,'apoyo');
  await denied(call('submitCorrection',other,{...request,file:fixture('apoyo')}),'not-found');
  await denied(call('submitCorrection',owner,{...request,file:fixture('historia')}),'invalid-argument');
  assert.equal((await call('submitCorrection',owner,{...request,file:fixture('apoyo')})).status,'reviewing');
  assert.equal((await call('myRequests',owner)).items[0].correctionKind,null);
  assert.deepEqual(operations,['save','ack','save']);
  await call('setStatus',operator,{...request,status:'awaiting_certificate'});
  const delivery = {...request,file:fixture('certificate'),confirm:true};
  await denied(call('sendCertificate',operator,delivery),'permission-denied');
  await denied(call('sendCertificate',{...supervisor,token:{...supervisor.token,auth_time:supervisor.token.auth_time-901}},delivery),'unauthenticated');
  assert.equal((await call('sendCertificate',supervisor,delivery)).status,'sent');
  await denied(call('downloadFile',other,{...request,kind:'certificate'}),'not-found');
  await denied(call('downloadFile',other,{id:'0'.repeat(64),kind:'certificate'}),'not-found');
  await denied(call('downloadFile',owner,{...request,kind:'historia'}),'not-found');
  assert.deepEqual(await call('downloadFile',owner,{...request,kind:'certificate'}),fixture('certificate'));
  const history = await call('adminHistory',operator,request);
  assert.ok(history.items.some(x=>x.action==='notification_sent'&&x.actorUid===supervisor.uid));
  assert.ok(history.items.some(x=>x.action==='download:certificate'&&x.actorUid===owner.uid));
  await db.doc('pilotUsers/'+owner.uid).update({active:false});
  await denied(call('downloadFile',owner,{...request,kind:'certificate'}),'permission-denied');
});

test.after(async()=>{globalThis.fetch=localFetch;await db.terminate();});
