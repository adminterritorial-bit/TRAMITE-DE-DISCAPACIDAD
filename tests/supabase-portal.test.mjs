import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function context(mode='dual'){
 const calls=[];
 const output=value=>JSON.parse(JSON.stringify(value));
 const ctx={
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>({
   SITS_BACKEND_MODE:mode,SITS_SB_TEST_EMAILS:'salud@sanpedro-valle.gov.co'
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
  vm.runInContext(readFileSync('apps-script/spark/'+name+'.gs','utf8'),ctx);
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
 };
 ctx.spMail_=(to,subject,body)=>sent.push({to,subject,body});
 const row={reference:'SSP-QA',owner_email:'salud@sanpedro-valle.gov.co'};
 ctx.sitsSbAcknowledge_({},row);
 ctx.sitsSbAcknowledge_({},row);
 assert.equal(locked,false);
 assert.equal(sent.length,1);
 assert.equal(sent[0].to,row.owner_email);
 assert.match(sent[0].subject,/^\[PRUEBA\]/);
 assert.match(sent[0].body,/Solicitud ficticia/);
});
