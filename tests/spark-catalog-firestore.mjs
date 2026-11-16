import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import vm from 'node:vm';
const host=process.env.FIRESTORE_EMULATOR_HOST;
assert.match(host||'',/^127\.0\.0\.1:\d+$/);
const project='demo-discapacidad';
assert.equal(process.env.GCLOUD_PROJECT,project);
const database='projects/'+project+'/databases/(default)/documents';
const ctx=vm.createContext({
 Utilities:{getUuid:randomUUID},
 PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},
 CacheService:{getScriptCache:()=>({remove(){}})}
});
for(const script of ['UnifiedBackend.gs','ServiceCatalog.gs']){
 const source=readFileSync(new URL('../apps-script/spark/'+script,import.meta.url),'utf8').replace('projects/tramite-discapacidad/databases/(default)/documents',database);
 vm.runInContext(source,ctx);
}
ctx.spHash_=s=>createHash('sha256').update(s).digest('hex');
ctx.spRest_=(suffix,method,data,allowMissing)=>{
 const args=['--silent','--show-error','--write-out','\n%{http_code}','--max-time','10','--request',method.toUpperCase(),
  '--header','Authorization: Bearer owner','--header','Content-Type: application/json','http://'+host+'/v1/'+database+suffix];
 if(data!==undefined)args.push('--data-binary',JSON.stringify(data));
 const out=execFileSync(process.platform==='win32'?'curl.exe':'curl',args,{encoding:'utf8'});
 const split=out.lastIndexOf('\n'),text=out.slice(0,split),code=Number(out.slice(split+1));
 if(code===404&&allowMissing)return null;
 assert.equal(code,200,text);
 return JSON.parse(text);
};
const call=(u,action,data={})=>ctx.spDispatch_(u,action,data);
const user={uid:'spark-citizen',email:'ciudadano@example.invalid',role:null};
const author={uid:'spark-admin',role:'admin',authTime:Date.now()/1000};
const supervisor={uid:'spark-supervisor',role:'supervisor',authTime:Date.now()/1000};
const operator={uid:'spark-operator',role:'operator',authTime:Date.now()/1000};
call(author,'categorySave',{id:'orientacion',title:'Orientación'});
const created=call(author,'serviceSave',{id:'orientacion-spark',revision:0,schema:{
 title:'Orientación operativa',description:'Registro sintético.',category:'orientacion',channel:'Secretaría de Salud',
 operators:[operator.uid],fields:[{id:'tipo',label:'Tipo',type:'select',options:['informacion'],required:true}],
 states:[{id:'received',label:'Recibida',next:['reviewing']},{id:'reviewing',label:'En revisión',next:['closed']},{id:'closed',label:'Cerrada',next:[]}]
}});
const published=call(supervisor,'servicePublish',{id:created.id,revision:created.revision,reference:'Acto de prueba del emulador'});
const docs=call(user,'institutionalForm').documents;
const decisions=Array.from(docs,d=>({id:d.id,version:d.version,hash:d.hash,act:d.act,decision:d.act==='notice'?'acknowledged':d.act==='terms'?'accepted':'declined'}));
const apply={id:published.id,version:published.live.version,key:randomUUID(),synthetic:true,answers:{tipo:'informacion'},legalDecisions:decisions};
const request=call(user,'serviceApply',apply);
assert.ok(request.createdAt>0);
assert.equal(call(user,'serviceApply',apply).id,request.id);
assert.equal(call(user,'serviceMine').items.length,1);
assert.equal(call(operator,'serviceInbox').items.length,1);
assert.equal(call({...operator,uid:'unrelated'},'serviceInbox').items.length,0);
assert.throws(()=>call({...user,uid:'unrelated'},'serviceCase',{id:request.id}),/not_found/);
assert.equal(call(user,'serviceMine',{after:request.id}).items.length,0);
assert.equal(call(user,'evidenceList').items.length,3);
call(operator,'serviceTransition',{id:request.id,revision:1,status:'reviewing'});
call(supervisor,'serviceTransition',{id:request.id,revision:2,status:'closed'});
assert.equal(call(user,'serviceCase',{id:request.id}).status,'closed');
assert.equal(call(user,'serviceCase',{id:request.id}).history.some(x=>x.actorUid),false);
console.log('Apps Script REST evaluado en Firestore Emulator con escrituras condicionadas, evidencia, ámbitos, cursor, historial y cierre.');
