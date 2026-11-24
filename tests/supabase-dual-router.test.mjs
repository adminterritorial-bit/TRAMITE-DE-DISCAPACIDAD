import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const backend=readFileSync('apps-script/spark/UnifiedBackend.gs','utf8');
const adapter=readFileSync('apps-script/spark/SupabaseBridge.gs','utf8');
const router=backend.match(/function doPost\(e\)\{[\s\S]*?\n\}/)?.[0];
const enabled=adapter.match(/function sitsSbOn_\(\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(router&&enabled,'Router and mode gate must be found');
function dispatch(mode,probe){
 const properties={getProperty(name){return name==='SITS_BACKEND_MODE'?mode:null;}};
 const context={
  PropertiesService:{getScriptProperties:()=>properties},
  sitsSbHandle_:()=>({backend:'supabase'}),
  spHandle_:()=>({backend:'firebase'}),
  output_:o=>o,
  SPARK_BUILD_:'spark-unified-2.0'
 };
 vm.runInNewContext(enabled+'\n'+router,context);
 return {enabled:context.sitsSbOn_(),value:context.doPost({parameter:{probe}})};
}
test('dual mode permits both protocols without mixing tokens',()=>{
 assert.equal(dispatch('dual','sits-supabase-v1').value.backend,'supabase');
 assert.equal(dispatch('dual','spark-pilot-v1').value.backend,'firebase');
 assert.equal(dispatch('dual','sits-supabase-v1').enabled,true);
});
test('final supabase mode rejects Firebase client',()=>{
 assert.equal(dispatch('supabase','sits-supabase-v1').value.backend,'supabase');
 assert.equal(dispatch('supabase','spark-pilot-v1').value.error,'legacy_backend_disabled');
});
test('legacy mode does not grant Supabase access',()=>{
 assert.equal(dispatch('firebase','spark-pilot-v1').value.backend,'firebase');
 assert.equal(dispatch('firebase','sits-supabase-v1').value.error,'pilot_disabled');
 assert.equal(dispatch('firebase','sits-supabase-v1').enabled,false);
});
