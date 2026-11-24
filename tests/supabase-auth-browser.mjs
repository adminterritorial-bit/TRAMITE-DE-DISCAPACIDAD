import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
// Controlled browser contract: no real account, documents, Drive or email.
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const pageErrors=[],called=[],diagnostics=[];
 let signedIn=true;
 let rejectedIdentity=false;
 page.on('console',message=>diagnostics.push(message.text()));
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
   const signedSession={user,access_token:'test-user-token'};
   let session=${signedIn ? 'signedSession' : 'null'}, subscribe;
   return {auth:{onAuthStateChange(fn){subscribe=fn;queueMicrotask(()=>fn('INITIAL_SESSION',session));return {data:{subscription:{unsubscribe(){}}}};},
    getSession:async()=>({data:{session},error:null}),
    async signInWithIdToken(options){
     window.testTokenOptions=options;
     if(${rejectedIdentity})return {error:new Error('test-sensitive-provider-message')};
     session=signedSession;subscribe('SIGNED_IN',session);return {data:{session},error:null};
    },
    signOut:async()=>({error:null})}};
  }`
 }));
 await page.route('https://accounts.google.com/gsi/client',r=>r.fulfill({
  contentType:'application/javascript',
  body:`window.google={accounts:{id:{
   initialize(options){window.googleIdentityOptions=options;},
   renderButton(mount){
    const button=document.createElement('button');
    button.textContent='Continuar con Google';
    button.onclick=()=>window.googleIdentityOptions.callback({credential:'fixture.google.identity'});
    mount.append(button);
   }
  }}};`
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
     :action==='officialInbox'?{items:[]}
     :action==='institutionalForm'?{documents:[]}
     :action==='institutionalPublic'?{notices:[],policies:[]}:{}},
    headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Gestión integral de expedientes'}).waitFor({timeout:25000});
 assert.ok(called.includes('sessionAccess'));
 assert.ok(called.includes('officialInbox'));
 assert.ok(called.includes('institutionalForm'));
 assert.ok(called.includes('institutionalPublic'));
 assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('staff-workspace')),true);
 assert.deepEqual(pageErrors,[]);
 signedIn=false;
 await page.evaluate(()=>sessionStorage.setItem('sits-login-destination','admin'));
 const callback=new URL('http://127.0.0.1:8080/');
 callback.searchParams.set('error','server_error');
 callback.searchParams.set('error_code','unexpected_failure');
 callback.searchParams.set('error_description','Unable to exchange external code: fictitious-code-marker');
 await page.goto(callback.href,{waitUntil:'domcontentloaded'});
 const failure=page.getByRole('alert').filter({hasText:'unexpected_failure'});
 await failure.waitFor();
 assert.match(await failure.innerText(),/Supabase no pudo completar el ingreso/);
 assert.equal(new URL(page.url()).search,'');
 assert.equal(new URL(page.url()).hash,'#admin');
 await page.waitForFunction(()=>document.getElementById('googleLogin')?.disabled===false);
 assert.ok(diagnostics.some(message=>message.includes('provider_code_exchange_failed')));
 assert.ok(diagnostics.every(message=>!message.includes('fictitious-code-marker')));
 assert.deepEqual(pageErrors,[]);
 await page.locator('#googleLogin').click();
 await page.getByRole('button',{name:'Continuar con Google'}).click();
 await page.getByRole('heading',{name:'Gestión integral de expedientes'}).waitFor();
 const identity=await page.evaluate(()=>({google:window.googleIdentityOptions.nonce,input:window.testTokenOptions}));
 assert.equal(identity.input.provider,'google');
 assert.equal(identity.input.token,'fixture.google.identity');
 assert.equal(identity.google,createHash('sha256').update(identity.input.nonce).digest('hex'));
 assert.equal(await page.getByRole('dialog',{name:'Ingresa con Google'}).isVisible(),false);
 rejectedIdentity=true;
 await page.goto('http://127.0.0.1:8080/?identityRetry=1#admin');
 await page.locator('#googleLogin').click();
 await page.getByRole('button',{name:'Continuar con Google'}).click();
 await page.getByText(/Supabase no pudo validar tu cuenta/).waitFor();
 assert.ok(diagnostics.some(line=>line.includes('google_identity_rejected')));
 assert.ok(diagnostics.every(line=>!line.includes('test-sensitive-provider-message')&&!line.includes('fixture.google.identity')));
 assert.deepEqual(pageErrors,[]);
 console.log('Supabase Google identity token, nonce and sanitized errors verified in browser.');
}finally{await browser.close();}
