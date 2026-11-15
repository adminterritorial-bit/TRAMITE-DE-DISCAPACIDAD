// Deploy as Salud. A private certificate is made available in the authenticated portal.
function doPost(e){return signed_(e,'delivery',function(a,d){
  if(a!=='deliver'||!/^[a-f0-9]{64}$/.test(d.requestId||'')||!/^SP-PIL-[A-F0-9]{16}$/.test(d.radicado||'')||!isValidEmail_(d.email||'')||d.portal!==prop_('PORTAL_URL'))throw Error('bad request');
  var root=root_(),folder=existingFolder_(root,d.requestId);if(d.file.kind!=='certificate')throw Error('kind');
  var cert=savePdf_(folder,d.file),marker=folder.getFilesByName('delivery-'+d.file.sha+'.json');
  if(marker.hasNext()){var state=JSON.parse(marker.next().getBlob().getDataAsString());if(state.sent===true)return {certificate:cert,sent:true};throw Error('delivery uncertain');}
  if(MailApp.getRemainingDailyQuota()<1)return {certificate:cert,sent:false};
  // Mark before sending; ambiguous delivery requires manual reconciliation, never blind resend.
  var journal=folder.createFile('delivery-'+d.file.sha+'.json',JSON.stringify({sent:false}),MimeType.PLAIN_TEXT);
  MailApp.sendEmail({to:d.email,subject:'Notificación de trámite '+d.radicado,body:'Tiene un documento disponible para su trámite '+d.radicado+'. Ingrese con el correo verificado en '+d.portal+' para descargarlo de forma segura. No reenvíe sus credenciales. Secretaría de Salud — Alcaldía de San Pedro.'});
  journal.setContent(JSON.stringify({sent:true}));
  return {certificate:cert,sent:true};
});}
