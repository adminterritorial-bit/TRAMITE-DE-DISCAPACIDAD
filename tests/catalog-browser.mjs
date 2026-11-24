import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';

const browser=await chromium.launch();
try{
 const context=await browser.newContext({viewport:{width:1280,height:960}});
 const page=await context.newPage();
 await page.addInitScript(()=>{
  window.__spoken=[];class Speech{constructor(text){this.text=text;}}
  Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:Speech});
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{lang:'es-CO',localService:true}],speak:u=>{window.__spoken.push(u.text);queueMicrotask(()=>u.onend?.());},cancel(){},addEventListener(){}}});
 });
 const sdk={
  'firebase-app':'export const initializeApp=x=>x;',
  'firebase-auth':`export const browserSessionPersistence={};export const getAuth=()=>({});
  export const setPersistence=async()=>{};export const onAuthStateChanged=(a,fn)=>queueMicrotask(()=>fn({uid:'supervisor',email:'salud@example.invalid',emailVerified:true,getIdToken:async()=> 'local-test'}));`,
  'firebase-app-check':'export const initializeAppCheck=()=>({});export const ReCaptchaEnterpriseProvider=class {};export const getLimitedUseToken=async()=>({token:"local-test"});'
 };
 await page.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:sdk[r.request().url().split('/').at(-1).replace('.js','')]}));
 const baseline={id:'discapacidad',title:'Certificación de discapacidad',description:'Orientación de solicitud.',category:'certificacion',standard:true};
 const allCategories=[{id:'certificacion',title:'Certificación'}], categories=[], services=[];
 const statements=[
  {id:'policy-privacy',version:1,act:'notice',required:true,title:'Conocimiento del aviso',body:'Aviso de prueba.'},
  {id:'policy-terms',version:2,act:'terms',required:true,title:'Aceptación de condiciones',body:'Texto de prueba.'}
 ].map(d=>({...d,hash:'0'.repeat(64)}));
 let application;const staffInvites=[];
 await page.route('https://script.google.com/macros/s/**',r=>{
  const method=r.request().method(),url=new URL(r.request().url());
  let output={ok:true,build:'spark-unified-2.0',enabled:true};
  if(method==='GET'&&url.searchParams.get('content')==='public')Object.assign(output,{notices:[],policies:[]});
  if(method==='GET'&&url.searchParams.get('content')==='catalog')Object.assign(output,{items:[baseline,...services.filter(x=>x.live).map(x=>({id:x.id,...x.live}))],categories:[...allCategories,...categories]});
  if(method==='POST'){
   const {action,data}=JSON.parse(new URLSearchParams(r.request().postData()).get('payload'));
   if(action==='categorySave')categories.push({...data,active:true});
   if(action==='serviceSave')services.push({id:data.id,revision:1,state:'draft',draft:data.schema});
   if(action==='servicePublish'){const service=services.find(x=>x.id===data.id);service.live={...service.draft,version:2};service.state='published';service.revision=2;}
   if(action==='serviceApply')application=data;
   if(action==='staffInvite')staffInvites.push({email:data.email,role:data.role,state:'pending',expiresAt:Date.now()+604800000});
   output.data={
    sessionAccess:{role:'supervisor',canManage:true,institutional:true},
    institutionalPublic:{notices:[],policies:[]},institutionalForm:{documents:statements},adminList:{role:'supervisor',items:[]},
    staffList:{items:[{uid:'supervisor',email:'salud@sanpedro-valle.gov.co',role:'supervisor',active:true}],invitations:staffInvites},catalogAdmin:{canPublish:true,categories,services},serviceRead:{...(services.find(x=>x.id===data.id)?.live||{})},
    serviceApply:{radicado:'SP-PIL-LOCAL',status:'received'}
   }[action]||{};
  }
  return r.fulfill({json:output,headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.goto('http://127.0.0.1:8080/');
 await page.locator('body.staff-workspace').waitFor();
 await page.getByRole('button',{name:'Portal ciudadano',exact:true}).click();
 await page.getByRole('heading',{name:'Trámites y servicios de Salud'}).waitFor();
 await page.locator('.navbtn[data-view=citizen]').click();
 await page.locator('.intake-state').waitFor();
 assert.equal(await page.locator('#applicationForm').isVisible(),false,'No presentar la carga sintética como recepción pública');
 await page.locator('.navbtn[data-view=catalog]').click();
 await page.getByRole('button',{name:'Escuchar guía'}).click();
 await page.locator('#voice-guide:not([hidden])').waitFor();
 assert.equal(await page.locator('dialog[open]').count(),0);
 await page.getByLabel('Buscar trámite').hover();
 await page.waitForFunction(()=>window.__spoken.some(x=>x.includes('Buscador de trámites')));
 await page.getByLabel('Buscar trámite').fill('NO-LEER-DATO-PRIVADO');
 assert.equal(await page.evaluate(()=>window.__spoken.some(x=>x.includes('NO-LEER-DATO-PRIVADO'))),false);
 await page.getByRole('button',{name:'Limpiar filtros'}).click();
 await page.locator('.navbtn[data-view=legal]').click();
 await page.waitForFunction(()=>window.__spoken.some(x=>x.includes('Aquí encuentras información')));
 assert.equal(await page.locator('#voice-guide').isVisible(),true);
 await page.locator('.navbtn[data-view=catalog]').click();
 await page.getByRole('button',{name:'Vista de lista'}).focus();
 await page.waitForFunction(()=>window.__spoken.some(x=>x.includes('Vista de lista')));
 await page.getByRole('button',{name:'Pausar',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Continuar',exact:true}).filter({visible:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Desactivar',exact:true}).click();
 assert.equal(await page.locator('#voice-guide').isVisible(),false);
 await page.getByRole('heading',{name:'Certificación de discapacidad'}).filter({visible:true}).waitFor();
 await page.getByRole('button',{name:'¿Necesitas ayuda?'}).click();
 await page.getByRole('dialog',{name:'Cómo utilizar SITS Salud'}).waitFor();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Vista de lista'}).click();
 assert.equal(await page.getByRole('button',{name:'Vista de lista'}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Vista de tarjetas'}).click();
 await page.getByLabel('Buscar trámite').fill('CERTIFICACION');
 await page.getByRole('heading',{name:'Certificación de discapacidad'}).filter({visible:true}).waitFor();
 await page.getByRole('button',{name:'Limpiar filtros'}).click();
 await page.locator('#catalog article').filter({has:page.getByRole('heading',{name:'Certificación de discapacidad',exact:true})}).getByRole('button',{name:'Ver trámite'}).click();
 await page.getByRole('heading',{name:'Sobre este servicio'}).waitFor();
 await page.getByRole('button',{name:'Preparar requisitos sin iniciar sesión'}).click();
 await page.getByRole('dialog',{name:'Prepara tu solicitud'}).waitFor();
 await page.getByRole('checkbox',{name:'Consultar los requisitos en la Secretaría de Salud.'}).check();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Consultar catálogo'}).click();
 for(const width of [390,320,1280]){await page.setViewportSize({width,height:960});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Desborde de catálogo '+width);}
 const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
 assert.deepEqual(audit.violations.map(x=>[x.id,x.nodes.map(n=>n.target)]),[],'Catálogo accesible');

 await page.locator('#adminNav').click();
 if(!await page.locator('.admin-module-nav').evaluate(e=>e.open))await page.getByText('Menú institucional',{exact:true}).click();
 await page.getByRole('button',{name:'Catálogo y formularios'}).click();
 await page.getByLabel('Código de categoría').fill('orientacion');
 await page.getByLabel('Nombre de categoría').fill('Orientación');
 await page.getByRole('button',{name:'Guardar categoría'}).click();
 await page.getByRole('button',{name:'Crear trámite'}).click();
 await page.getByLabel('Código del trámite').fill('orientacion-prueba');
 await page.getByLabel('Nombre del trámite').fill('Orientación de prueba');
 await page.getByLabel('Descripción').fill('Prueba del trámite configurable.');
 await page.getByLabel('Canal autorizado').fill('Secretaría de Salud');
 await page.getByRole('button',{name:'Añadir campo'}).click();
 await page.getByLabel('Etiqueta del campo').fill('Tipo de consulta');
 await page.getByText('Configuración avanzada',{exact:true}).click();
 await page.getByLabel('Identificador del campo').fill('tipo');
 await page.getByLabel('Tipo de campo').selectOption('select');
 await page.getByLabel(/Valor ficticio o lista/).fill('propia\napoyo');
 await page.getByRole('button',{name:'Previsualizar formulario'}).click();
 await page.getByLabel('Tipo de consulta').selectOption('apoyo');
 await page.getByRole('button',{name:'Guardar borrador'}).click();
 await page.getByLabel('Referencia de aprobación de Salud').fill('Aprobación de prueba del entorno local');
 await page.getByRole('button',{name:'Publicar trámite'}).click();
 await page.getByRole('button',{name:'Portal ciudadano',exact:true}).click();
 await page.getByLabel('Buscar trámite').fill('Orientación');
 await page.locator('#catalog article').filter({has:page.getByRole('heading',{name:'Orientación de prueba',exact:true})}).getByRole('button',{name:'Ver trámite'}).click();
 await page.getByLabel('Tipo de consulta').selectOption('apoyo');
 await page.getByRole('checkbox',{name:/Conocimiento del aviso/}).check();
 await page.getByRole('checkbox',{name:/Aceptación de condiciones/}).check();
 await page.getByRole('checkbox',{name:/Confirmo que esta solicitud/}).check();
 const {violations}=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
 assert.deepEqual(violations.map(x=>[x.id,x.nodes.map(n=>n.target)]),[]);
 await page.getByRole('button',{name:'Registrar solicitud'}).click();
 await page.getByText('SP-PIL-LOCAL').waitFor();
 assert.equal(application.version,2);
 assert.equal(application.answers.tipo,'apoyo');
 assert.equal(application.legalDecisions.length,2);
 await page.locator('#adminNav').click();
 await page.getByRole('button',{name:'Administrar equipo →'}).click();
 await page.getByLabel('Correo del nuevo integrante').fill('operador@sanpedro-valle.gov.co');
 await page.getByRole('button',{name:'Crear invitación'}).click();
 await page.getByText('operador@sanpedro-valle.gov.co',{exact:true}).waitFor();
 assert.equal(staffInvites[0].role,'operator');
 assert.equal(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth+1),true);
 console.log('Catálogo operativo y constructor configurados y recorridos de extremo a extremo con servicios controlados.');
}finally{await browser.close();}
