import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../apps-script/spark/UnifiedBackend.gs',import.meta.url),'utf8');
function scene(values={}){
 const props=new Map(Object.entries(values)),ctx=vm.createContext({
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||''})},
  Utilities:{base64Decode:x=>[...Buffer.from(x,'base64')],newBlob:x=>({getBytes:()=>[...Buffer.from(x)]})}
 });
 vm.runInContext(source,ctx);
 ctx.digest_=bytes=>createHash('sha256').update(Buffer.from(bytes)).digest('hex');
 ctx.instRead_=()=>({data:null});
 ctx.root_=()=>({id:'private-institutional-root'});
 return {ctx,props};
}
test('production reception does not depend on invented approval-reference flags',()=>{
 const {ctx}=scene();
 const ready=ctx.officialCapabilities_();
 assert.equal(ready.enabled,true);
 assert.equal(ready.documents.length,4);
 assert.ok(ready.documents.some(d=>d.kind==='sensitive'&&/salud/.test(d.body.toLowerCase())));
 assert.ok(ready.documents.every(d=>d.hash.length===64&&d.version===1&&d.body));
});
test('technical backend failures keep intake unavailable rather than claiming it is ready',()=>{
 const {ctx}=scene();
 ctx.root_=()=>{throw Error('private_root_unavailable');};
 assert.throws(()=>ctx.officialCapabilities_(),/private_root_unavailable/);
});
test('published policy versions override the institutional baseline',()=>{
 const {ctx}=scene();
 ctx.instRead_=(collection,id)=>({data:{published:{id,title:'Política revisada '+id,kind:id.replace('policy-',''),effective:Date.now()-10,version:3,hash:'a'.repeat(64),body:'Texto aprobado'}}});
 const result=ctx.officialCapabilities_();
 assert.equal(result.enabled,true);
 assert.equal(result.documents.length,4);
 assert.ok(result.documents.every(x=>x.version===3&&x.title.startsWith('Política revisada')));
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
test('health inbox requires supervisor role or explicit approved UID allowlist',()=>{
 const {ctx}=scene();
 for(const role of [null,'operator','admin'])assert.throws(()=>ctx.officialStaff_({uid:'other',role}),/forbidden/);
 assert.doesNotThrow(()=>ctx.officialStaff_({uid:'supervisor-uid',role:'supervisor'}));
 const allowed=scene({SITS_HEALTH_CASE_OFFICERS:'authorized-health-officer'});
 assert.doesNotThrow(()=>allowed.ctx.officialStaff_({uid:'authorized-health-officer',role:'admin'}));
 assert.throws(()=>allowed.ctx.officialStaff_({uid:'other',role:'supervisor'}),/forbidden/);
});
