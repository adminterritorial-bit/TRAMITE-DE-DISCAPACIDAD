import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function context(mode='dual',qa=false){
 const calls=[];
 const output=value=>JSON.parse(JSON.stringify(value));
 const ctx={
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>({
   SITS_BACKEND_MODE:mode,SITS_SB_TEST_EMAILS:'salud@sanpedro-valle.gov.co',
   SITS_SB_SECRET_KEY:'sb_secret_fictitious'
  }[key]??null)})},
  Utilities:{
   base64Decode(value){return Array.from(Buffer.from(value,'base64'));},
   DigestAlgorithm:{SHA_256:'sha256'},
   computeDigest(_algorithm,bytes){return Array.from(createHash('sha256').update(Buffer.from(bytes)).digest());}
  },
  ContentService:{createTextOutput:text=>({setMimeType:()=>JSON.parse(text)}),MimeType:{JSON:'json'}},
 };
 vm.createContext(ctx);
 for(const name of ['UnifiedBackend','ServiceCatalog','SupabaseBridge','SupabasePortal']){
  const source=readFileSync('apps-script/spark/'+name+'.gs','utf8');
  vm.runInContext(qa?source.replace('const SITS_SB_FORCE_TEST_=false;','const SITS_SB_FORCE_TEST_=true;'):source,ctx);
 }
 ctx.sitsSbRows_=(_table,query)=>{calls.push(query);return [];};
 ctx.sitsSbRpc_=(name,payload)=>{calls.push({name,payload:output(payload)});return [];};
 ctx.spRest_=()=>assert.fail('Supabase request touched Firestore');
 return {ctx,calls,output};
}

test('public catalog and notices read Supabase in dual mode, missing probe is rejected in final mode',()=>{
 const {ctx,calls}=context();
 const request=content=>ctx.doGet({parameter:{probe:'sits-supabase-v1',content}});
 assert.equal(request('catalog').items[0].id,'discapacidad');
 assert.deepEqual(request('public').notices,[]);
 assert.ok(calls.every(x=>typeof x==='string'&&x.includes('collection=eq.')));
 assert.equal(context('supabase').ctx.doGet({parameter:{content:'catalog'}}).error,'legacy_backend_disabled');
});

test('catalog and legal changes share atomic revision-checked Supabase commit semantics',()=>{
 const {ctx,calls}=context();
 ctx.sitsPortalRun_(()=>{
  const previous={updateTime:'3'};
  const guard={verify:ctx.spName_('catalog','registry'),currentDocument:{updateTime:'3'}};
  ctx.spCommit_([guard,ctx.spPut_('rateLimits','qa-limit',{count:4},previous,['updatedAt'])]);
 });
 assert.deepEqual(calls,[{name:'sits_portal_commit',payload:{_writes:[
  {collection:'catalog',id:'registry',revision:'3'},
  {collection:'rateLimits',id:'qa-limit',revision:'3',data:{count:4},timestamps:['updatedAt']}
 ]}}]);
});

test('dual mode allows only approved test accounts, identity and bundled PDF bytes',()=>{
 const {ctx}=context();
 const user={email:'salud@sanpedro-valle.gov.co'};
 const bytes=readFileSync('public/pilot-fixtures/historia.pdf');
 const sha=createHash('sha256').update(bytes).digest('hex');
 const data={name:'Persona de prueba',documentNumber:'TEST001',
  files:[{kind:'historia',sha,size:bytes.length,base64:bytes.toString('base64')}]};
 assert.doesNotThrow(()=>ctx.sitsSbTestGuard_(user,'officialSubmit',data));
 assert.throws(()=>ctx.sitsSbTestGuard_({email:'qa@example.invalid'},'officialSubmit',data),/not_enabled/);
 assert.throws(()=>ctx.sitsSbTestGuard_(user,'officialSubmit',{...data,documentNumber:'123456'}),/invalid_profile/);
 const another=Buffer.from('%PDF-1.4 synthetic but unapproved PDF');
 assert.throws(()=>ctx.sitsSbTestGuard_(user,'officialSubmit',{...data,files:[{kind:'historia',
  size:another.length,sha:createHash('sha256').update(another).digest('hex'),base64:another.toString('base64')
 }]}),/invalid_fixture/);
});

test('test receipts use the verified address and an idempotent, marked MailApp journal',()=>{
 const {ctx}=context();
 let locked=false;
 const sent=[];
 ctx.LockService={getScriptLock:()=>({
  waitLock(){locked=true;},hasLock:()=>locked,releaseLock(){locked=false;}
 })};
 const journals=new Set();
 ctx.spJournal_=(_folder,name,send)=>{
  assert.equal(locked,true);
  if(!journals.has(name)){journals.add(name);send();}
  return true;
 };
 ctx.spMail_=(to,subject,body)=>sent.push({to,subject,body});
 const row={id:'fixture-case',reference:'SSP-QA',owner_email:'salud@sanpedro-valle.gov.co'};
 const audits=[];
 ctx.sitsSbCall_=(path,method,data,_token,server,minimal)=>audits.push({path,method,data,server,minimal});
 ctx.sitsSbAcknowledge_({},row);
 ctx.sitsSbAcknowledge_({},row);
 assert.equal(locked,false);
 assert.equal(sent.length,1);
 assert.equal(sent[0].to,row.owner_email);
 assert.match(sent[0].subject,/^\[PRUEBA\]/);
 assert.match(sent[0].body,/Solicitud ficticia/);
 assert.ok(audits.every(event=>event.data.event_type==='notification:confirmed'&&event.minimal===true));
});

test('QA remains restricted when the project mode is Supabase',()=>{
 const {ctx}=context('supabase',true);
 const user={email:'salud@sanpedro-valle.gov.co',role:'supervisor',canManage:true,institutional:true};
 assert.equal(ctx.sitsSbDispatch_(user,'sessionAccess',{},'fixture').testIntake,true);
 assert.throws(()=>ctx.sitsSbTestGuard_({email:'citizen@example.invalid'},'officialMine',{}),/not_enabled/);
 ctx.sitsSbCase_=()=>({owner_user_id:'fixture',applicant_name:'Other person',document_number:'OTHER'});
 assert.throws(()=>ctx.sitsSbDispatch_(user,'officialRead',{id:'fixture'},'token'),/not_found/);
 assert.equal(context('supabase').ctx.sitsSbDispatch_(user,'sessionAccess',{},'fixture').testIntake,false);
});

test('Supabase accepts successful empty REST writes and void RPC responses',()=>{
 const {ctx}=context('supabase');
 let status=204;
 ctx.UrlFetchApp={fetch:(_url,options)=>{
  assert.equal(options.headers.apikey,'sb_secret_fictitious');
  assert.equal(options.headers.Authorization,undefined);
  return {getResponseCode:()=>status,getContentText:()=>''};
 }};
 assert.equal(ctx.sitsSbCall_('rest/v1/rpc/sits_portal_commit','post',{},null,true),null);
 status=201;
 assert.equal(ctx.sitsSbCall_('rest/v1/sits_audit_events','post',{},null,true,true),null);
 status=403;
 assert.throws(()=>ctx.sitsSbCall_('rest/v1/sits_audit_events','post',{},null,true,true),/database_unavailable/);
});

test('configured intake without documents uses the canonical ledger and disability still requires a PDF',()=>{
 const {ctx,calls}=context('supabase');
 const citizen={uid:'fixture',email:'ciudadano@example.invalid'};
 const request={serviceId:'orientacion-eps',serviceVersion:2,answers:{motivo:'Traslado'},files:[]};
 ctx.spLimit_=()=>{};
 ctx.sitsSbCase_=()=>({id:'fixture',status:'received',reference:'QA-EPS',service_id:'orientacion-eps'});
 const result=ctx.sitsSbDispatch_(citizen,'configuredSubmit',request,'test-token');
 assert.equal(result.reference,'QA-EPS');
 assert.equal(calls[0].name,'sits_create_configured_case');
 assert.deepEqual(calls[0].payload._payload.documentKinds,[]);
 assert.equal('files' in calls[0].payload._payload,false);
 assert.throws(()=>ctx.sitsSbDispatch_(citizen,'officialSubmit',{files:[]},'test-token'),/invalid_request/);
});
