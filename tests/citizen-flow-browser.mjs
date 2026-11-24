import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:390,height:840}});
try{
 const submissions=[];
 let acceptingRequests;
 const documents=['processing','privacy','terms','sensitive'].map((kind,i)=>({
  id:kind,kind,title:'Política ficticia '+(i+1),body:'Texto de prueba del asistente.',version:1,hash:String(i+1).repeat(64)
 }));
 await page.addInitScript(()=>sessionStorage.setItem('sb-ovppffchdkwbikdppuzh-auth-token','fixture-user-session'));
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/**',r=>r.fulfill({
  contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},
  body:`export function createClient(){
   const session={user:{id:'qa-owner',email:'ciudadano@example.invalid',email_confirmed_at:'2026-11-24T12:00:00Z'},access_token:'qa-token'};
   return {auth:{onAuthStateChange(fn){queueMicrotask(()=>fn('INITIAL_SESSION',session));},getSession:async()=>({data:{session}}),signOut:async()=>({})}};
  }`
 }));
 await page.route('https://script.google.com/macros/s/**',r=>{
  const response={ok:true,build:'sits-supabase-1.0',enabled:true,acceptingRequests};
  const request=r.request();
  if(request.method()==='GET'){
   Object.assign(response,{documents,items:[],categories:[],notices:[],policies:[]});
  }else{
   const data=new URLSearchParams(request.postData());
   const req=JSON.parse(data.get('payload'));
   assert.equal(data.get('probe'),'sits-supabase-v1');
   if(req.action==='officialSubmit'){
    submissions.push(req.data);
    if(submissions.length===1)return r.fulfill({status:503,body:'',headers:{'Access-Control-Allow-Origin':'*'}});
    response.data={status:'received',reference:'QA-401',createdAt:'2026-11-24T12:00:00Z'};
   }else if(req.action==='sessionAccess')response.data={canManage:false};
   else if(req.action==='officialRead')return r.fulfill({json:{ok:false,build:'sits-supabase-1.0',error:'not_found'},headers:{'Access-Control-Allow-Origin':'*'}});
   else if(req.action==='officialMine')response.data={items:[{
    id:'owned-fixture',reference:'QA-401',status:'received',createdAt:'2026-11-24T12:00:00Z',updatedAt:'2026-11-24T12:00:00Z',files:[],history:[]
   }]};
   else response.data={items:[],notices:[],policies:[],documents:[]};
  }
  return r.fulfill({json:response,headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.goto('http://127.0.0.1:8080/#citizen');
 await page.getByRole('heading',{name:'Recepción electrónica restringida'}).waitFor();
 assert.equal(await page.getByRole('form',{name:'Solicitud de certificación de discapacidad'}).count(),0);
 acceptingRequests=true;
 await page.reload();
 const form=page.getByRole('form',{name:'Solicitud de certificación de discapacidad'});
 await form.waitFor();
 await form.getByRole('button',{name:'Continuar',exact:true}).click();
 await form.getByRole('alert').filter({hasText:'Revisa la información'}).waitFor();
 await form.getByLabel('Nombre completo').fill('Persona de prueba');
 await form.getByLabel('Tipo de documento').selectOption('CC');
 await form.getByLabel('Número de documento').fill('TEST001');
 await form.getByRole('button',{name:'Continuar',exact:true}).click();
 await form.getByLabel('Zona de residencia').selectOption('Cabecera municipal');
 await form.getByRole('button',{name:'Continuar',exact:true}).click();
 const fixture=readFileSync(new URL('../public/pilot-fixtures/historia.pdf',import.meta.url));
 const file=form.locator('input[name=historia]');
 await file.setInputFiles({name:'historia.pdf',mimeType:'application/pdf',buffer:Buffer.from('Contenido no válido para el expediente ficticio')});
 await form.getByText('El contenido del archivo no corresponde a un PDF.').waitFor();
 await file.setInputFiles({name:'historia.pdf',mimeType:'application/pdf',buffer:fixture});
 await form.getByText(/historia\.pdf ·/).waitFor();
 await form.getByRole('button',{name:'Continuar',exact:true}).click();
 for(const control of await form.locator('section:not([hidden]) input[required]').all())await control.check();
 await form.getByRole('button',{name:'Continuar',exact:true}).click();
 await form.getByRole('button',{name:'Editar Teléfono',exact:true}).click();
 await form.getByLabel('Teléfono de contacto').fill('000 000 0000');
 for(let step=0;step<3;step++)await form.getByRole('button',{name:'Continuar',exact:true}).click();
 await form.getByText('000 000 0000',{exact:false}).waitFor();
 await form.getByRole('button',{name:'Enviar solicitud',exact:true}).click();
 await form.getByText(/No se confirmó la recepción/).waitFor();
 await form.getByRole('button',{name:'Enviar solicitud',exact:true}).click();
 await page.getByRole('heading',{name:'Documentación recibida'}).waitFor();
 assert.equal(submissions.length,2);
 assert.equal(submissions[0].key,submissions[1].key);
 assert.equal(submissions[1].medicalConsent,true);
 assert.equal(submissions[1].files[0].kind,'historia');
 await page.getByRole('button',{name:'Consultar mis solicitudes',exact:true}).click();
 await page.getByRole('heading',{name:'QA-401'}).waitFor();
 assert.equal(await page.locator('#trackingList').getByText('QA-AJENA').count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);
 console.log('SITS Salud: cinco pasos, errores accesibles, PDF verificado y radicación idempotente en entorno simulado.');
}finally{await browser.close();}
