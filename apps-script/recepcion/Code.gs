// Deploy as the Salud account; root folder private. Do not expose the shared secret.
function doPost(e){return signed_(e,'archive',function(a,d){
  var root=root_();
  if(!/^[a-f0-9]{64}$/.test(d.requestId||''))throw Error('bad id');
  if(a==='save'){
    var folder=folder_(root,d.requestId),out=[];
    if(!Array.isArray(d.files)||d.files.length<1||d.files.length>2)throw Error('bad files');
    d.files.forEach(function(f){if(['historia','apoyo'].indexOf(f.kind)<0)throw Error('bad kind');out.push(savePdf_(folder,f));});
    return {files:out};
  }
  if(a==='ack'){
    if(!/^SP-PIL-[A-F0-9]{16}$/.test(d.radicado||'')||!isValidEmail_(d.email||'')||d.portal!==prop_('PORTAL_URL'))throw Error('bad request');
    var target=existingFolder_(root,d.requestId),prev=target.getFilesByName('ack.json');
    if(prev.hasNext()){var state=JSON.parse(prev.next().getBlob().getDataAsString());if(state.sent===true)return {sent:true};throw Error('uncertain');}
    if(MailApp.getRemainingDailyQuota()<2)return {sent:false};
    var journal=target.createFile('ack.json',JSON.stringify({sent:false}),MimeType.PLAIN_TEXT);
    MailApp.sendEmail({to:d.email,subject:'Acuse de prueba '+d.radicado,body:'Recibimos su solicitud en el entorno de pruebas. Referencia: '+d.radicado+'. No constituye radicación oficial. Consulte el estado en '+d.portal});
    MailApp.sendEmail({to:prop_('HEALTH_EMAIL'),subject:'Nueva solicitud piloto '+d.radicado,body:'Existe un expediente de prueba disponible en el panel institucional. Referencia: '+d.radicado+'. Consulte en '+d.portal});
    journal.setContent(JSON.stringify({sent:true}));return {sent:true};
  }
  if(a==='read'){
    var folder=existingFolder_(root,d.requestId),f=requireRestricted_(DriveApp.getFileById(d.fileId)),parents=f.getParents(),valid=false;
    while(parents.hasNext()){if(parents.next().getId()===folder.getId())valid=true;}
    if(!valid||f.getMimeType()!=='application/pdf'||f.getSize()>5*1024*1024)throw Error('not found');
    var bytes=f.getBlob().getBytes();if(digest_(bytes)!==d.sha)throw Error('hash');
    return {base64:Utilities.base64Encode(bytes)};
  }
  throw Error('action');
});}
