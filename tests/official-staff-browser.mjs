import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route(/\/app\.js(?:\?.*)?$/,r=>r.fulfill({status:200,contentType:'text/javascript',body:''}));
 await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{
  document.body.innerHTML='<div id="adminDashboard"><div class="dashbar"></div></div>';
  const {renderOfficialStaffInbox}=await import('./official-staff.js?v=1');
  const item={
   id:'a'.repeat(64),reference:'SSP-2026-PRUEBA',status:'reviewing',revision:3,createdAt:Date.now(),
   name:'Persona ficticia',email:'ejemplo@example.invalid',documentType:'CC',documentNumber:'TEST001',
   zone:'Cabecera municipal',representation:'propia',phone:'',history:[],files:[{kind:'historia',size:4200}],
   certificateEmailConsent:true
  };
  window.__calls=[];window.__item=item;
  const invoke=async(action,data={})=>{
   window.__calls.push(action);
   if(action==='officialInbox')return {items:[{...item}]};
   if(action==='officialRead')return {...item};
   if(action==='officialTransition'){
    item.status=data.status;item.revision++;item.history.push({status:data.status,at:Date.now(),comment:data.comment});
    return {...item};
   }
   if(action==='officialSendCertificate'){
    item.status='delivered';item.deliveryMethod='email';item.certificateAvailable=true;
    item.certificate={kind:'certificate',size:3452};item.revision++;return {...item};
   }
   if(action==='officialDownload')return {base64:'JVBERi0xLjcK'};
   throw Error('unexpected_action:'+action);
  };
  await renderOfficialStaffInbox({invoke,validatePdf:async()=>
   ({kind:'certificate',base64:'JVBERi0xLjcK',sha:'a'.repeat(64),size:9})});
 });
 await page.getByRole('heading',{name:'Gestión integral de expedientes'}).waitFor();
 await page.getByRole('button',{name:'Gestionar SSP-2026-PRUEBA'}).click();
 await page.getByText('En revisión',{exact:true}).first().waitFor();
 assert.equal(await page.locator('.case-list-card').count(),1);
 const selector=page.getByLabel('Nuevo estado');
 await selector.selectOption('awaiting_certificate');
 await page.getByPlaceholder('Motivo de la decisión y orientaciones para el ciudadano').fill('Soportes revisados, pendiente de certificado expedido.');
 await page.getByRole('button',{name:'Registrar actuación'}).click();
 await page.getByText('Entrega por correo autorizada',{exact:true}).waitFor();
 await page.getByLabel('Adjuntar certificado PDF').setInputFiles({name:'certificado.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nContenido de prueba')});
 await page.getByText(/Confirmo que el PDF corresponde/).locator('..').locator('input[type=checkbox]').check();
 await page.getByRole('button',{name:'Cargar y entregar certificado'}).click();
 await page.getByText('El certificado fue enviado al correo verificado.').waitFor();
 const calls=await page.evaluate(()=>window.__calls);
 assert.equal(calls.filter(x=>x==='officialTransition').length,1);
 assert.equal(calls.filter(x=>x==='officialSendCertificate').length,1);
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('SITS: expediente, revisión, carga de certificado y entrega UI comprobados.');
}finally{await browser.close();}
