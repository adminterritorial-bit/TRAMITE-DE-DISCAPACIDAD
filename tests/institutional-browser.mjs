import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 const remoteErrors=[];
 page.on('pageerror',e=>remoteErrors.push(e.message));
 const statements=[
  {id:'policy-privacy',act:'notice',version:1,required:true,title:'Conocimiento del aviso',body:'Aviso de prueba.'},
  {id:'policy-terms',act:'terms',version:4,required:true,title:'Aceptación de términos',body:'Condiciones de prueba.'},
  {id:'policy-electronic',act:'electronic_notice',version:1,required:false,title:'Comunicaciones opcionales',body:'Correo de prueba.'}
 ].map(x=>({...x,hash:'a'.repeat(64)}));
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm',r=>r.fulfill({
  contentType:'application/javascript',headers:{'Access-Control-Allow-Origin':'*'},
  body:`export function createClient(){
   const session={user:{id:'citizen',email:'cuenta@example.invalid',email_confirmed_at:'2026-11-24T12:00:00Z'},access_token:'local-test'};
   return {auth:{onAuthStateChange(fn){queueMicrotask(()=>fn('INITIAL_SESSION',session));},
    getSession:async()=>({data:{session},error:null}),signInWithOAuth:async()=>({error:null}),signOut:async()=>({error:null})}};
  }`
 }));
 const intakeDocuments=['processing','privacy','terms','sensitive'].map(kind=>({
  id:'intake-'+kind,kind,version:1,hash:'a'.repeat(64),title:kind,body:'Documento de prueba'
 }));
 let sent=null;
 await page.route('https://script.google.com/macros/s/**',r=>{
  const method=r.request().method();
  let output={ok:true,build:'sits-supabase-1.0',enabled:true,documents:intakeDocuments};
  if(method==='GET'&&r.request().url().includes('content=public'))Object.assign(output,{notices:[],policies:[]});
  if(method==='POST'){
   const {action,data}=JSON.parse(new URLSearchParams(r.request().postData()).get('payload'));
   const result={sessionAccess:{canManage:false,institutional:true},institutionalForm:{documents:statements},institutionalPublic:{notices:[],policies:[]},myRequests:{items:[]},rightsMine:{items:[]},evidenceList:{items:[]},submitRequest:{radicado:'SP-PIL-TEST',status:'received'}}[action];
   if(action==='submitRequest')sent=data;
   output.data=result;
  }
  return r.fulfill({json:output,headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.goto('http://127.0.0.1:8080/pilot.html');
 await page.locator('#next').click();
 await page.getByRole('button',{name:'Adjuntar PDF ficticio obligatorio'}).click();
 await page.getByRole('button',{name:'PDF de prueba adjuntado'}).waitFor();
 await page.locator('#next').click();
 assert.equal(await page.getByRole('radio',{name:'Sí, autorizo los avisos por correo'}).isChecked(),false);
 assert.equal(await page.getByRole('radio',{name:'No autorizo los avisos por correo'}).isChecked(),false);
 await page.getByRole('checkbox',{name:/Conocimiento del aviso/}).check();
 await page.getByRole('checkbox',{name:/Aceptación de términos/}).check();
 await page.locator('[name=synthetic]').check();
 await page.getByRole('button',{name:'Enviar solicitud de prueba'}).click();
 await page.locator('#receipt:not(.hidden)').waitFor();
 assert.equal(sent.legalDecisions[2].decision,'unselected');
 assert.equal(sent.legalDecisions[1].version,4);
 const downloading=page.waitForEvent('download');
 await page.getByRole('button',{name:'Guardar constancia accesible'}).click();
 const download=await downloading;
 assert.equal(download.suggestedFilename(),'constancia-del-piloto.html');
 assert.deepEqual(remoteErrors,[]);
 console.log('Pilot browser test with stubbed Supabase/Apps Script verified decisions and branded receipt.');
}finally{await browser.close();}
