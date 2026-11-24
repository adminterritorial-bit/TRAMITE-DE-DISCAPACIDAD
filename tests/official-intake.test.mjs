import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../apps-script/spark/UnifiedBackend.gs',import.meta.url),'utf8');
function scene(values={}){
 const props=new Map(Object.entries(values)),ctx=vm.createContext({
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||''})},
  Utilities:{base64Decode:x=>[...Buffer.from(x,'base64')]},
  digest_:bytes=>createHash('sha256').update(Buffer.from(bytes)).digest('hex')
 });
 vm.runInContext(source,ctx);return {ctx,props};
}
const readyProps={SITS_LIVE_INTAKE_ENABLED:'true',SITS_LIVE_APPROVAL_REF:'SALUD-APROBACION-001',SITS_LEGAL_APPROVAL_REF:'JURIDICA-APROBACION-001',SITS_SECURITY_APPROVAL_REF:'TIC-SEGURIDAD-001',SITS_RECORDS_APPROVAL_REF:'ARCHIVO-TRD-001',SITS_HEALTH_CASE_OFFICERS:'supervisor-uid'};
test('institutional upload is closed by default, even for a verified citizen',()=>{
 const {ctx}=scene();assert.equal(ctx.officialCapabilities_().enabled,false);
 assert.throws(()=>ctx.officialDispatch_({uid:'citizen',email:'citizen@example.com',role:null},'officialSubmit',{}),/pilot_disabled/);
});
test('a flag without approvals and formally published policies never activates upload',()=>{
 const {ctx}=scene({SITS_LIVE_INTAKE_ENABLED:'true'});
 assert.equal(ctx.officialCapabilities_().enabled,false);
 const valid=scene(readyProps);valid.ctx.instRead_=()=>({data:null});assert.equal(valid.ctx.officialCapabilities_().enabled,false);
});
test('published legal versions are required before activation',()=>{
 const {ctx}=scene(readyProps);
 ctx.instRead_=(collection,id)=>({data:{published:{id,title:id,kind:id.replace('policy-',''),effective:Date.now()-10,version:3,hash:'a'.repeat(64),body:'Texto aprobado'}}});
 const result=ctx.officialCapabilities_();assert.equal(result.enabled,true);assert.equal(result.documents.length,4);assert.ok(result.documents.every(x=>!Object.hasOwn(x,'ownerUid')));
});
test('PDF hash, magic bytes, size and required clinical support are checked on the server',()=>{
 const {ctx}=scene();const b=Buffer.from('%PDF-1.7\n%Example private input content.');
 const sha=createHash('sha256').update(b).digest('hex'),file={kind:'historia',base64:b.toString('base64'),sha,size:b.length};
 assert.equal(ctx.officialFiles_([file])[0].sha,sha);
 for(const bad of [{...file,sha:'0'.repeat(64)},{...file,size:123},{...file,kind:'certificate'},
  {...file,base64:Buffer.from('NOTPDF-1.7 and other content!').toString('base64')}])
  assert.throws(()=>ctx.officialFiles_([bad]),/invalid_fixture/);
 assert.throws(()=>ctx.officialFiles_([{...file,kind:'apoyo'}]),/invalid_fixture/);
 assert.throws(()=>ctx.officialFiles_([file,file]),/invalid_fixture/);
});
test('only explicitly authorized health officers have access to inbox and case processing',()=>{
 const {ctx}=scene(readyProps);
 for(const role of [null,'operator','admin','supervisor']){
  assert.throws(()=>ctx.officialStaff_({uid:'not-listed',role}),/forbidden/);
 }
 assert.doesNotThrow(()=>ctx.officialStaff_({uid:'supervisor-uid',role:'supervisor'}));
});
