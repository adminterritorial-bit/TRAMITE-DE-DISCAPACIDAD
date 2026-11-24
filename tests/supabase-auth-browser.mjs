import {chromium} from 'playwright';
import assert from 'node:assert/strict';
// Controlled browser contract: no real account, documents, Drive or email.
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const pageErrors=[],called=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 page.on('request',r=>{if(r.url().includes('firebasejs'))pageErrors.push('Unexpected Firebase SDK request');});
 const policies=['processing','privacy','terms','sensitive'].map((kind,i)=>({
  id:'legal-'+kind,kind,title:'Documento '+kind,body:'Texto normativo de prueba',version:1,hash:(i+1).toString().repeat(64)
 }));
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm',r=>r.fulfill({
  contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'},
  body:`export function createClient(){
   const user={id:'staff-test-google',email:'adminterritorial@sanpedro-valle.gov.co',
    email_confirmed_at:'2026-11-24T12:00:00.000Z'};
   const session={user,access_token:'test-user-token'};
   return {auth:{onAuthStateChange(fn){queueMicrotask(()=>fn('INITIAL_SESSION',session));return {data:{subscription:{unsubscribe(){}}}};},
    getSession:async()=>({data:{session},error:null}),
    signInWithOAuth:async()=>({error:null}),signOut:async()=>({error:null})}};
  }`
 }));
 await page.route('https://script.google.com/macros/s/**',route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()==='GET'){
   if(url.searchParams.get('content')==='official-intake')
    return route.fulfill({json:{ok:true,enabled:true,build:'sits-supabase-1.0',documents:policies},
     headers:{'Access-Control-Allow-Origin':'*'}});
   if(url.searchParams.get('content')==='catalog')
    return route.fulfill({json:{ok:true,items:[],categories:[]},
     headers:{'Access-Control-Allow-Origin':'*'}});
   return route.fulfill({json:{ok:true,notices:[],policies:[]},
    headers:{'Access-Control-Allow-Origin':'*'}});
  }
  const fields=new URLSearchParams(req.postData());
  assert.equal(fields.get('probe'),'sits-supabase-v1');
  assert.equal(fields.get('accessToken'),'test-user-token');
  assert.equal(fields.get('appCheck'),null);
  const {action}=JSON.parse(fields.get('payload'));
  called.push(action);
  return route.fulfill({json:{ok:true,build:'sits-supabase-1.0',
   data:action==='sessionAccess'
     ?{role:'supervisor',canManage:true,institutional:true}
     :action==='officialInbox'?{items:[]}:{}},
    headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Gestión integral de expedientes'}).waitFor({timeout:25000});
 assert.ok(called.includes('sessionAccess'));
 assert.ok(called.includes('officialInbox'));
 assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('staff-workspace')),true);
 assert.deepEqual(pageErrors,[]);
 console.log('Supabase OAuth adapter: verified staff session and read-only inbox routing in browser.');
}finally{await browser.close();}
