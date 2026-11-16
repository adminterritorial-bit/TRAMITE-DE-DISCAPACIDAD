import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
const source=n=>readFileSync(new URL('../apps-script/spark/'+n,import.meta.url),'utf8');
function setup(){
 const db=new Map(),events=[];
 const ctx=vm.createContext({});
 for(const n of ['UnifiedBackend.gs','ServiceCatalog.gs'])vm.runInContext(source(n),ctx);
 Object.assign(ctx,{
  spHash_:s=>createHash('sha256').update(s).digest('hex'),spLimit_:()=>{},
  spRead_:(c,id)=>db.get(c+'/'+id)||null,
  spPut_:(c,id,data,prior,timestamps=[])=>({c,id,data,prior,timestamps}),
  spName_:(c,id)=>c+'/'+id,
  spAudit_:(id,uid,action)=>({audit:{id,uid,action}}),
  spQuery_:(c)=>[...db.values()].filter(x=>x.name.startsWith(c+'/')),
  spCommit_:writes=>{
   for(const w of writes){if(w.audit)continue;if(w.verify){assert.equal(db.get(w.verify)?.updateTime,w.currentDocument.updateTime);continue;}assert.equal(db.get(w.c+'/'+w.id)?.updateTime,w.prior?.updateTime);}
   for(const w of writes){if(w.audit){events.push(w.audit);continue;}if(w.verify)continue;const n=w.c+'/'+w.id,before=db.get(n),data={...(before?ctx.spData_(before.fields):{}),...w.data};for(const k of w.timestamps)data[k]=Date.now();db.set(n,{name:n,updateTime:randomUUID(),fields:ctx.spFields_(data)});}
  }
 });
 const seed=(c,id,data)=>db.set(c+'/'+id,{name:c+'/'+id,updateTime:randomUUID(),fields:ctx.spFields_(data)});
 return {ctx,events,seed,read:(c,id)=>db.has(c+'/'+id)?ctx.spData_(db.get(c+'/'+id).fields):null};
}
const sup={uid:'supervisor',email:'salud@sanpedro-valle.gov.co',role:'supervisor',authTime:Date.now()/1000};
const email='operador@sanpedro-valle.gov.co';
test('only a recent supervisor can invite an institutional operator; no promotion to supervisor',()=>{
 const {ctx}=setup();
 for(const actor of [{...sup,role:'operator'},{...sup,authTime:0}])assert.throws(()=>ctx.catStaff_(actor,'staffInvite',{email,role:'operator'}),/forbidden|recent_login/);
 for(const bad of [{email:'external@example.com',role:'operator'},{email,role:'supervisor'},{email:sup.email,role:'admin'}])assert.throws(()=>ctx.catStaff_(sup,'staffInvite',bad),/invalid_request|forbidden/);
 const invite=ctx.catStaff_(sup,'staffInvite',{email:'  OPERADOR@SANPEDRO-VALLE.GOV.CO ',role:'operator'});
 assert.equal(invite.email,email);assert.equal(invite.state,'pending');
 assert.equal(ctx.catStaff_(sup,'staffList',{}).invitations[0].state,'pending');
});
test('one-time invitation grants the expected verified identity, never an existing or disabled staff account',()=>{
 const {ctx,read,events,seed}=setup();
 ctx.catStaff_(sup,'staffInvite',{email,role:'operator'});
 assert.equal(ctx.catClaimInvite_('bad','other@sanpedro-valle.gov.co',null,null),false);
 assert.equal(ctx.catClaimInvite_('disabled',email,{active:false},null),false);
 assert.equal(ctx.catClaimInvite_('existing',email,null,{active:false,role:'admin'}),false);
 assert.equal(ctx.catClaimInvite_('newuid',email,null,null),true);
 assert.equal(read('users','newuid').active,true);assert.equal(read('admins','newuid').role,'operator');
 assert.equal(ctx.catClaimInvite_('another',email,null,null),false);
 assert.equal(ctx.catStaff_(sup,'staffList',{}).invitations[0].state,'claimed');
 assert.ok(events.some(e=>e.action==='staff:invitation_claimed'));
 assert.throws(()=>ctx.catStaff_(sup,'staffInvite',{email,role:'admin'}),/invalid_transition/);
});
test('revoked and expired invitations cannot grant privileges',()=>{
 const {ctx,seed}=setup();ctx.catStaff_(sup,'staffInvite',{email,role:'operator'});
 ctx.catStaff_(sup,'staffRevokeInvite',{email});assert.equal(ctx.catClaimInvite_('user',email,null,null),false);
 const id=ctx.spHash_(email);
 seed('staffInvites',id,{email,role:'operator',state:'pending',expiresAt:Date.now()-1,invitedBy:sup.uid});
 assert.equal(ctx.catClaimInvite_('user',email,null,null),false);
});
