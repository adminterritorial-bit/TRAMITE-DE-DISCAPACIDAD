import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../apps-script/spark/SparkAuth.gs',import.meta.url),'utf8');
function setup({provider='google.com',verified=true,existing=null,admin=null,disabled=false,quota=0}={}){
 const db=new Map();const writes=[];const uid='new-user';const email='new@example.com';let locked=false;
 if(existing)db.set('users/'+uid,existing);if(admin)db.set('admins/'+uid,admin);
 const claims={aud:'tramite-discapacidad',iss:'https://securetoken.google.com/tramite-discapacidad',sub:uid,email,email_verified:verified,exp:Date.now()/1000+1000,auth_time:Math.floor(Date.now()/1000)-1,iat:Math.floor(Date.now()/1000)-1,firebase:{sign_in_provider:provider}};
 const ctx=vm.createContext({LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})},prop_:()=> 'test',spRead_:(c,k)=>c==='rateLimits'&&quota?{fields:{count:quota}}:db.has(c+'/'+k)?{fields:db.get(c+'/'+k)}:null,spData_:x=>x,spHash_:x=>x,spPut_:(c,id,data)=>({c,id,data}),spAudit_:()=>({c:'audit'}),spCommit_:batch=>{assert.equal(locked,true);for(const row of batch){writes.push(row);if(row.c==='users')db.set(row.c+'/'+row.id,row.data);}}});
 vm.runInContext(src,ctx);Object.assign(ctx,{sparkClaims_:()=>claims,sparkJson_:()=>({users:[{localId:uid,email,emailVerified:verified,disabled}]}),sparkDoc_:(c,k)=>db.get(c+'/'+k)||null});
 return {ctx,writes,db};
}
test('verified Google citizen provisions automatically during session only; no staff grant',()=>{
 const {ctx,writes}=setup();assert.throws(()=>ctx.sparkIdentity_('token',false,false),/not_enabled/);
 assert.equal(ctx.sparkIdentity_('token',false,true).role,null);
 assert.equal(writes.filter(x=>x.c==='users').length,1);
 assert.ok(writes.every(x=>x.c!=='admins'));
 ctx.sparkIdentity_('token',false,true);assert.equal(writes.filter(x=>x.c==='users').length,1);
 assert.throws(()=>ctx.sparkIdentity_('token',true,true),/forbidden/);
});
test('unverified, disabled, non-Google, revoked, orphan staff and quota exhaustion never auto-create',()=>{
 for(const opts of [{verified:false},{disabled:true},{provider:'password'},{existing:{active:false}},{admin:{active:false,role:'admin'}},{quota:200}]){
  const {ctx,writes}=setup(opts);assert.throws(()=>ctx.sparkIdentity_('token',false,true),/invalid_identity|not_enabled|rate_limit/);assert.equal(writes.length,0);
 }
});
