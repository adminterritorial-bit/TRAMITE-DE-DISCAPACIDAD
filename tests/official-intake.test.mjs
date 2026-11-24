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


function simulatedRequest(){
 const {ctx}=scene(),id='a'.repeat(64);
 const entry={name:'Persona de ejemplo',documentType:'CC',documentNumber:'1234567',email:'ciudadano@example.invalid',
  ownerUid:'citizen',reference:'SSP-2026-TEST',zone:'Cabecera municipal',status:'reviewing',revision:2,files:[],history:[],notifyByEmail:false};
 const document={name:'projects/demo/databases/(default)/documents/officialRequests/'+id,fields:{},updateTime:'now'};
 const writes=[];let sent=0;
 ctx.spRead_=()=>document;
 ctx.spData_=()=>entry;
 ctx.spLimit_=()=>{};
 ctx.instRecent_=()=>{};
 ctx.officialStaff_=()=>{};
 ctx.spPut_=(collection,key,data)=>({type:'record',data});
 ctx.spAudit_=()=>({type:'audit'});
 ctx.spCommit_=commits=>{writes.push(...commits);for(const w of commits)if(w.type==='record')Object.assign(entry,w.data);};
 return {ctx,id,entry,writes,document,countMail:()=>sent,sendMail:()=>sent++};
}
test('workflow permits only expected state changes and keeps a versioned history',()=>{
 const {ctx,id,entry}=simulatedRequest(),officer={uid:'supervisor',role:'supervisor',email:'salud@example.invalid'};
 assert.throws(()=>ctx.officialDispatch_(officer,'officialTransition',{id,status:'delivered',revision:2,comment:'No corresponde'}),/invalid_transition/);
 const result=ctx.officialDispatch_(officer,'officialTransition',{id,status:'awaiting_certificate',revision:2,comment:'Revisión documental terminada'});
 assert.equal(result.status,'awaiting_certificate');assert.equal(entry.revision,3);assert.equal(entry.history.length,1);
 assert.throws(()=>ctx.officialDispatch_(officer,'officialTransition',{id,status:'reviewing',revision:2,comment:'Edición antigua'}),/invalid_transition/);
});
test('certificate validation requires real PDF, expected digest, and dedicated document kind',()=>{
 const {ctx}=scene(),pdf=Buffer.from('%PDF-1.7\n%Example authorised certificate payload');
 const file={kind:'certificate',base64:pdf.toString('base64'),sha:createHash('sha256').update(pdf).digest('hex'),size:pdf.length};
 assert.equal(ctx.officialCertificateFile_(file).kind,'certificate');
 assert.throws(()=>ctx.officialCertificateFile_({...file,sha:'a'.repeat(64)}),/invalid_fixture/);
 assert.throws(()=>ctx.officialCertificateFile_({...file,kind:'historia'}),/invalid_fixture/);
});
test('email certificate cannot be sent twice on repeated delivery calls',()=>{
 const x=simulatedRequest(),{ctx,id,entry}=x;entry.status='sending';entry.certificateEmailConsent=true;
 entry.certificate={kind:'certificate',sha:'a'.repeat(64),fileId:'private-doc',size:80};
 ctx.root_=()=>({});ctx.existingFolder_=()=>({});
 ctx.officialPdf_=()=>({base64:'JVBERi0xLjcK'});
 ctx.spJournal_=(_,__,send)=>{send();return true};
 ctx.officialCertificateMail_=x.sendMail;
 const officer={uid:'supervisor',role:'supervisor'};
 assert.equal(ctx.officialDeliver_(officer,id).status,'delivered');assert.equal(x.countMail(),1);
 assert.throws(()=>ctx.officialDeliver_(officer,id),/invalid_transition/);
 assert.equal(x.countMail(),1);
});
test('uncertain email delivery never triggers an automatic second attempt',()=>{
 const x=simulatedRequest(),{ctx,id,entry}=x;entry.status='sending';entry.certificateEmailConsent=true;
 entry.certificate={kind:'certificate',sha:'a'.repeat(64),fileId:'private-doc',size:80};
 ctx.root_=()=>({});ctx.existingFolder_=()=>({});
 ctx.officialPdf_=()=>({base64:'JVBERi0xLjcK'});
 ctx.spJournal_=()=>{throw Error('unknown_mail_result')};
 assert.equal(ctx.officialDeliver_({uid:'supervisor'},id).status,'delivery_review');
 assert.throws(()=>ctx.officialDeliver_({uid:'supervisor'},id),/invalid_transition/);
});
test('an annex correction is permitted only when explicitly requested',()=>{
 const {ctx}=scene(),b=Buffer.from('%PDF-1.7\n%Correction annex document payload');
 const f={kind:'apoyo',base64:b.toString('base64'),sha:createHash('sha256').update(b).digest('hex'),size:b.length};
 assert.equal(ctx.officialFiles_([f],true)[0].kind,'apoyo');
 assert.throws(()=>ctx.officialFiles_([f]),/invalid_fixture/);
});
