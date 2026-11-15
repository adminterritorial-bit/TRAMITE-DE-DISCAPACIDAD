import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const script=fs.readFileSync(new URL('../apps-script/spark/ReceptionPilot.gs',import.meta.url),'utf8');
function context({enabled=true,validApp=true,validUser=true}={}){
 const calls=[];
 const sandbox=vm.createContext({
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>key==='SPARK_PILOT_ENABLED'?(enabled?'true':'false'):'private-test-key'})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({value:s,setMimeType(){return this;}})},
  LockService:{getScriptLock:()=>({waitLock(){},hasLock(){return true},releaseLock(){}})},
  sparkVerifyApp_:()=>{calls.push('app');if(!validApp)throw Error('app')},
  sparkIdentity_:()=>{calls.push('identity');if(!validUser)throw Error('auth');return {uid:'test',role:'supervisor'}}
 });
 vm.runInContext(script,sandbox);
 return {sandbox,calls};
}
function request(c,action='sessionAccess',data={}){
 const parameter={probe:'spark-pilot-v1',appCheck:'test',idToken:'test',payload:JSON.stringify({action,data})};
 const args={parameter,parameters:Object.fromEntries(Object.entries(parameter).map(([k,v])=>[k,[v]])),postData:{length:100}};
 return JSON.parse(c.sandbox.doPost(args).value);
}
test('operational router authenticates before returning session capabilities',()=>{const c=context();assert.deepEqual(request(c),{ok:true,data:{role:'supervisor',canManage:true,build:'spark-pilot-1.1'}});assert.deepEqual(c.calls,['app','identity']);});
test('disabled pilot returns explicit error without authentication',()=>{const c=context({enabled:false});assert.deepEqual(request(c),{ok:false,error:'pilot_disabled'});assert.deepEqual(c.calls,[]);});
test('invalid App Check and invalid identity fail closed',()=>{for(const cfg of [{validApp:false},{validUser:false}])assert.deepEqual(request(context(cfg)),{ok:false,error:'operation_failed'});});
test('unknown command and nonfixture are rejected before Firestore mutation',()=>{assert.deepEqual(request(context(),'unknown'),{ok:false,error:'invalid_request'});assert.deepEqual(request(context(),'submitRequest',{}),{ok:false,error:'invalid_request'});});
