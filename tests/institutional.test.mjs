import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import vm from 'node:vm';

function harness(){
 const db=new Map(), source=readFileSync(new URL('../apps-script/spark/UnifiedBackend.gs',import.meta.url),'utf8');
 const owner={uid:'citizen',role:null}, author={uid:'author',role:'supervisor',authTime:Date.now()/1000};
 const reviewer={uid:'reviewer',role:'admin',authTime:Date.now()/1000};
 const ctx=vm.createContext({
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='LEGAL_REVIEWERS'?'reviewer':key==='DATA_RIGHTS_OFFICERS'?'reviewer':null})},
  Utilities:{getUuid:randomUUID}
 });
 vm.runInContext(source,ctx);
 Object.assign(ctx,{
  spHash_:s=>createHash('sha256').update(s).digest('hex'),
  spLimit_:()=>{},
  spRead_:(c,id)=>db.get(c+'/'+id)||null,
  spRest_:()=>{throw Error('unexpected external request');},
  spPut_:(c,id,data,prior,times=[])=>({c,id,data,prior,times}),
  spCommit_:writes=>{
   for(const w of writes){
    if(w.verify)continue;
    const key=w.c+'/'+w.id;
    const previous=db.get(key);
    assert.equal(previous?.updateTime,w.prior?.updateTime);
    const values={...(previous?.fields||{}),...ctx.spFields_(w.data)};
    for(const name of w.times)values[name]={timestampValue:new Date().toISOString()};
    db.set(key,{name:key,fields:values,updateTime:randomUUID()});
   }
  },
  spQuery_:(c,field,value)=>[...db.values()].filter(x=>x.name.startsWith(c+'/')&&(!field||ctx.spData_(x.fields)[field]===value))
 });
 return {ctx,db,owner,author,reviewer,call:(u,action,data={})=>ctx.spDispatch_(u,action,data)};
}

test('scheduled notices expose only active public projections and preserve versions',()=>{
 const {ctx,call,owner,author,db}=harness();
 const notice={title:'Mantenimiento',body:'Visite la sede municipal.',start:Date.now()+10000,end:Date.now()+60000,
  priority:70,severity:'warning',audience:'public',channel:'modal',frequency:'session',service:'discapacidad'};
 assert.throws(()=>call(owner,'noticeSave',notice),/forbidden/);
 assert.throws(()=>call(author,'noticeSave',{...notice,title:'<img src=x>'}),/invalid_request/);
 const item=call(author,'noticeSave',notice);
 call(author,'noticeChange',{id:item.id,version:item.version,state:'published'});
 assert.equal(ctx.instNotices_('public',notice.start-1).length,0);
 assert.equal(ctx.instNotices_('public',notice.start).length,1);
 assert.equal(ctx.instNotices_('public',notice.end).length,0);
 assert.equal(ctx.instNotices_('public',notice.start)[0].actorUid,undefined);
 assert.equal(ctx.instNotices_('citizen',notice.start).length,1);
 const next=call(author,'noticeSave',{...notice,id:item.id,version:item.version+1,body:'Nuevo horario de prueba'});
 assert.equal(ctx.instNotices_('public',notice.start)[0].body,notice.body);
 call(author,'noticeChange',{id:next.id,version:next.version,state:'published'});
 call(author,'noticeChange',{id:next.id,version:next.version+1,state:'withdrawn'});
 assert.equal(ctx.instNotices_('public',notice.start).length,0);
 assert.equal([...db.keys()].filter(k=>k.startsWith('institutionalVersions/')).length,5);
});

test('distinct reviewer, in-force hash and separate decisions protect evidence',()=>{
 const {ctx,db,author,reviewer,owner,call}=harness();
 const edit=call(author,'policySave',{kind:'terms',version:0,title:'Condiciones del piloto',body:'Uso exclusivo de datos ficticios.'});
 call(author,'policyChange',{kind:'terms',version:edit.version,state:'review'});
 assert.throws(()=>call(author,'policyChange',{kind:'terms',version:2,state:'approved',reference:'Acto interno de prueba',effective:Date.now()}),/forbidden/);
 call(reviewer,'policyChange',{kind:'terms',version:2,state:'approved',reference:'Acto interno de prueba',effective:Date.now()-1});
 call(author,'policyChange',{kind:'terms',version:3,state:'published'});
 const docs=call(owner,'institutionalForm').documents;
 const decisions=Array.from(docs,x=>({id:x.id,version:x.version,hash:x.hash,act:x.act,decision:x.act==='electronic_notice'?'declined':x.act==='notice'?'acknowledged':'accepted'}));
 assert.throws(()=>ctx.instEvidence_(owner,'a'.repeat(64),decisions.map(x=>({...x,hash:'old'}))),/legal_version_changed/);
 assert.throws(()=>ctx.instEvidence_(owner,'a'.repeat(64),decisions.slice(1)),/legal_decision_required/);
 const result=ctx.instEvidence_(owner,'a'.repeat(64),decisions);
 assert.equal(result.notify,false);
 assert.equal(result.writes.filter(x=>x.verify).length,2);
 assert.equal(ctx.instEvidence_(owner,'a'.repeat(64),decisions.map(d=>d.act==='electronic_notice'?{...d,decision:'unselected'}:d)).writes.filter(x=>x.c==='legalEvidence').length,2);
 ctx.spCommit_(result.writes);
 assert.equal([...db.keys()].filter(k=>k.startsWith('legalEvidence/')).length,3);
 assert.equal(call(owner,'evidenceList').items.length,3);
 assert.equal(call({uid:'other',role:null},'evidenceList').items.length,0);
});

test('rights case is visible only to the owner and designated privacy staff',()=>{
 const {call,owner,reviewer,author}=harness();
 const item=call(owner,'rightsCreate',{key:randomUUID(),kind:'rectification'});
 assert.equal(call(owner,'rightsMine').items[0].id,item.id);
 assert.equal(call({uid:'other',role:null},'rightsMine').items.length,0);
 assert.throws(()=>call(author,'rightsInbox'),/forbidden/);
 const claimed=call(reviewer,'rightsUpdate',{id:item.id,version:1,state:'assigned'});
 assert.equal(claimed.state,'assigned');
 call(reviewer,'rightsUpdate',{id:item.id,version:2,state:'answered',answer:'Use el canal oficial para verificar la decisión.'});
 assert.equal(call(owner,'rightsMine').items[0].state,'answered');
});
