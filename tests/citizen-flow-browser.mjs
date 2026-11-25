import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:390,height:840}});
try{
 const submissions=[],configuredSubmissions=[];
 const configuredService={id:'orientacion-eps',title:'Orientación en EPS',description:'Gestiona una orientación de EPS',category:'eps-afiliaciones',channel:'Secretaría de Salud',version:2,intakeEnabled:true,intakeSchema:{version:2,title:'Orientación en EPS',category:'eps-afiliaciones',channel:'Secretaría de Salud',fields:[{id:'motivo',label:'Motivo de la orientación',type:'select',required:true,options:['Afiliación','Traslado']},{id:'soporte',label:'Soporte PDF',type:'document',fixture:'historia',required:true,condition:{field:'motivo',equals:'Afiliación'}}],states:[{id:'received',label:'Recibida',next:['reviewing']},{id:'reviewing',label:'Revisión',next:['closed']},{id:'closed',label:'Cerrada',next:[]}],operators:[]}};
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
   Object.assign(response,{documents,items:[configuredService],categories:[{id:'eps-afiliaciones',title:'EPS y afiliaciones'}],notices:[],policies:[]});
  }else{
   const data=new URLSearchParams(request.postData());
   const req=JSON.parse(data.get('payload'));
   assert.equal(data.get('probe'),'sits-supabase-v1');
   if(req.action==='officialSubmit'){
    submissions.push(req.data);
    if(submissions.length===1)return r.fulfill({status:503,body:'',headers:{'Access-Control-Allow-Origin':'*'}});
    response.data={status:'received',reference:'QA-401',createdAt:'2026-11-24T12:00:00Z'};
   }else if(req.action==='configuredSubmit'){
    configuredSubmissions.push(req.data);
    response.data={status:'received',reference:'QA-EPS-402',createdAt:'2026-11-24T12:00:00Z'};
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
 // A separately approved service reuses the official five-step citizen wizard.
 await page.locator('.navbtn[data-view=home]').click();
 const configured=page.locator('#homeCatalogCards .home-catalog-card[data-service=configured]');
 await configured.getByRole('button',{name:'Iniciar solicitud'}).click();
 const generic=page.getByRole('form',{name:'Solicitud de Orientación en EPS'});
 await generic.waitFor();
 await generic.getByLabel('Nombre completo').fill('Persona de prueba');
 await generic.getByLabel('Tipo de documento').selectOption('CC');
 await generic.getByLabel('Número de documento').fill('TEST002');
 await generic.getByRole('button',{name:'Continuar',exact:true}).click();
 await generic.getByLabel('Zona de residencia').selectOption('Cabecera municipal');
 await generic.getByLabel('Motivo de la orientación').selectOption('Traslado');
 await generic.getByRole('button',{name:'Continuar',exact:true}).click();
 assert.equal(await generic.locator('input[name=historia]').isVisible(),false);
 await generic.getByRole('button',{name:'Continuar',exact:true}).click();
 for(const control of await generic.locator('section:not([hidden]) input[required]').all())await control.check();
 await generic.getByRole('button',{name:'Continuar',exact:true}).click();
 await generic.locator('.intake-review dt').getByText('Motivo de la orientación',{exact:true}).waitFor();
 await generic.getByRole('button',{name:'Enviar solicitud',exact:true}).click();
 await page.getByText('QA-EPS-402').waitFor();
 assert.equal(configuredSubmissions.length,1);
 assert.equal(configuredSubmissions[0].serviceId,'orientacion-eps');
 assert.equal(configuredSubmissions[0].serviceVersion,2);
 assert.equal(configuredSubmissions[0].answers.motivo,'Traslado');
 assert.deepEqual(configuredSubmissions[0].files,[]);
 console.log('SITS Salud: cinco pasos oficiales y trámite configurable simulado aprobados, sin habilitar servicios nuevos en producción.');
}finally{await browser.close();}
