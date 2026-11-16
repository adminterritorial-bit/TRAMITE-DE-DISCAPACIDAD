import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {existsSync,readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';

const source=name=>readFileSync(new URL('../apps-script/spark/'+name,import.meta.url),'utf8');
const admin={uid:'administrador',role:'admin',authTime:Date.now()/1000};
const publisher={uid:'supervisor',role:'supervisor',authTime:Date.now()/1000};
const citizen={uid:'ciudadano',email:'ciudadano@example.invalid',role:null};
const template={title:'Orientación de prueba',description:'Servicio sintético.',category:'orientacion',channel:'Secretaría de Salud',
  fields:[
    {id:'tipo',label:'Tipo de solicitud',type:'select',required:true,options:['propia','apoyo']},
    {id:'nota',label:'Nota de prueba',type:'text',required:true,fixture:'Nota ficticia',condition:{field:'tipo',equals:'apoyo'}}
  ],states:[{id:'received',label:'Recibida',next:['reviewing']},{id:'reviewing',label:'Revisión',next:['closed']},{id:'closed',label:'Cerrada',next:[]}],operators:['operador']};
function harness(){
 const db=new Map(), log=[];
 const ctx=vm.createContext({Utilities:{getUuid:randomUUID,base64Decode:s=>Buffer.from(s,'base64')},MailApp:{getRemainingDailyQuota:()=>1}});
 vm.runInContext(source('UnifiedBackend.gs'),ctx);
 if(existsSync(new URL('../apps-script/spark/ServiceCatalog.gs',import.meta.url)))vm.runInContext(source('ServiceCatalog.gs'),ctx);
 Object.assign(ctx,{
   spLimit_:()=>{},spHash_:s=>createHash('sha256').update(s).digest('hex'),
   spRead_:(c,id)=>db.get(c+'/'+id)||null,
   spPut_:(c,id,data,prior,timestamps=[])=>({c,id,data,prior,timestamps}),
   spAudit_:(id,uid,action)=>({audit:{id,uid,action}}),
   spRest_:()=>{throw Error('unexpected external call');},
   spCommit_:writes=>writes.forEach(w=>{
     if(w.audit){log.push(w.audit);return;}
     if(w.verify)return;
     const name=w.c+'/'+w.id, before=db.get(name);
     assert.equal(w.prior?.updateTime,before?.updateTime);
     const data={...(before?ctx.spData_(before.fields):{}),...w.data};
     for(const key of w.timestamps)data[key]=Date.now();
     db.set(name,{name,updateTime:randomUUID(),fields:ctx.spFields_(data)});
   }),
   spQuery_:(c,key,value,_sort,_max,options)=>[...db.values()].filter(x=>{
    const field=ctx.spData_(x.fields)[key];
    return x.name.startsWith(c+'/')&&(!key||(options?.op==='ARRAY_CONTAINS'?field?.includes(value):field===value));
   }),
   instEvidence_:()=>({writes:[],notify:false}),
   spFixture_:(value,kind)=>{if(value.base64!=='fixture')throw Error('invalid_fixture');return {kind,sha:'fixture',size:42,base64:value.base64};},
   root_:()=>({}),folder_:()=>({}),existingFolder_:()=>({}),
   savePdf_:(_folder,file)=>({fileId:'private-fixture',sha:file.sha,kind:file.kind,size:file.size})
 });
 return {call:(u,a,d={})=>ctx.spDispatch_(u,a,d),db,log};
}

function published(call){
 const category=call(admin,'categorySave',{id:'orientacion',title:'Orientación'});
 assert.equal(category.id,'orientacion');
 const item=call(admin,'serviceSave',{id:'orientacion-prueba',revision:0,schema:template});
 assert.equal(item.state,'draft');
 assert.throws(()=>call(admin,'servicePublish',{id:item.id,revision:item.revision,reference:'Aprobación de prueba'}),/forbidden/);
 return call(publisher,'servicePublish',{id:item.id,revision:item.revision,reference:'Aprobación de prueba'});
}
test('admin creates and versions category and forms with public draft isolation',()=>{
 const {call}=harness();
 assert.throws(()=>call(citizen,'categorySave',{id:'orientacion',title:'Orientación'}),/forbidden/);
 assert.equal(call(citizen,'catalogList').items.length,1);
 const live=published(call);
 assert.equal(call(citizen,'catalogList').items.some(x=>x.id===live.id),true);
 assert.equal(call(citizen,'serviceRead',{id:live.id}).operators,undefined);
 const edited=call(admin,'serviceSave',{id:live.id,revision:live.revision,schema:{...template,title:'Cambio en borrador'}});
 assert.equal(call(citizen,'serviceRead',{id:live.id}).title,template.title);
 assert.throws(()=>call(publisher,'servicePublish',{id:live.id,revision:live.revision,reference:'Aprobación de prueba'}),/content_version_changed/);
 call(publisher,'serviceRetire',{id:edited.id,revision:edited.revision});
 assert.throws(()=>call(citizen,'serviceRead',{id:live.id}),/not_found/);
});
test('dynamic requests validate published version, conditions, fixture values, ownership and scope',()=>{
 const {call,log}=harness();
 const live=published(call);
 const data={id:live.id,version:live.live.version,key:randomUUID(),synthetic:true,answers:{tipo:'apoyo',nota:'Nota ficticia'},legalDecisions:[]};
 assert.throws(()=>call(citizen,'serviceApply',{...data,version:999}),/content_version_changed/);
 assert.throws(()=>call(citizen,'serviceApply',{...data,answers:{tipo:'propia',nota:'Nota ficticia'}}),/invalid_request/);
 assert.throws(()=>call(citizen,'serviceApply',{...data,answers:{tipo:'apoyo',nota:'Información privada'}}),/invalid_profile/);
 const request=call(citizen,'serviceApply',data);
 assert.equal(call(citizen,'serviceApply',data).id,request.id);
 assert.equal(call(citizen,'serviceMine').items.length,1);
 assert.throws(()=>call({uid:'otro',role:null},'serviceCase',{id:request.id}),/not_found/);
 const employee={uid:'operador',role:'operator'};
 assert.equal(call(employee,'serviceInbox').items.length,1);
 assert.equal(call({uid:'sin-acceso',role:'operator'},'serviceInbox').items.length,0);
 assert.match(call(employee,'serviceExport').csv,/orientacion-prueba,received,1/);
 assert.throws(()=>call(employee,'serviceTransition',{id:request.id,revision:1,status:'closed'}),/invalid_transition/);
 call(employee,'serviceTransition',{id:request.id,revision:1,status:'reviewing'});
 call(publisher,'serviceTransition',{id:request.id,revision:2,status:'closed'});
 assert.equal(call(citizen,'serviceCase',{id:request.id}).status,'closed');
 assert.ok(log.some(x=>x.uid==='operador'&&x.action==='service:reviewing'));
});
test('assigned staff requests a correction and only the owner can supply its approved fixture',()=>{
 const {call,log}=harness();
 call(admin,'categorySave',{id:'orientacion',title:'Orientación'});
 call(admin,'serviceSave',{id:'soportes',revision:0,schema:{...template,fields:[{id:'soporte',label:'Anexo',type:'document',required:false,fixture:'apoyo'}]}});
 const live=call(publisher,'servicePublish',{id:'soportes',revision:1,reference:'Prueba autorizada'});
 const request=call(citizen,'serviceApply',{id:'soportes',version:live.live.version,key:randomUUID(),synthetic:true,answers:{},legalDecisions:[]});
 const employee={uid:'operador',role:'operator'};
 call(employee,'serviceRequestCorrection',{id:request.id,revision:1,field:'soporte'});
 assert.equal(call(citizen,'serviceCase',{id:request.id}).correction.kind,'apoyo');
 assert.throws(()=>call(employee,'serviceTransition',{id:request.id,revision:2,status:'reviewing'}),/invalid_transition/);
 assert.throws(()=>call({uid:'otro',role:null},'serviceSubmitCorrection',{id:request.id,revision:2,file:{base64:'fixture'}}),/not_found/);
 assert.throws(()=>call(citizen,'serviceSubmitCorrection',{id:request.id,revision:2,file:{base64:'real'}}),/invalid_fixture/);
 call(citizen,'serviceSubmitCorrection',{id:request.id,revision:2,file:{base64:'fixture'}});
 assert.equal(call(citizen,'serviceCase',{id:request.id}).correction,null);
 assert.equal(call(citizen,'serviceCase',{id:request.id}).files[0].fileId,undefined);
 assert.ok(log.some(x=>x.uid===citizen.uid&&x.action==='service:correction_received'));
});
test('schema rejects script markup, executable field types and cyclic state configurations',()=>{
 const {call}=harness();
 call(admin,'categorySave',{id:'orientacion',title:'Orientación'});
 for(const schema of [
  {...template,title:'<script>alert(1)</script>'},
  {...template,fields:[{id:'ataque',label:'X',type:'javascript'}]},
  {...template,states:[{id:'received',label:'Inicio',next:['received']},{id:'closed',label:'Cierre',next:[]}]}
 ])assert.throws(()=>call(admin,'serviceSave',{id:'malicioso',revision:0,schema}),/invalid_request/);
});
