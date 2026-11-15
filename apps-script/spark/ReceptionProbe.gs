// Copy this file unchanged to BOTH independent Apps Script projects.
function prop_(key){var v=PropertiesService.getScriptProperties().getProperty(key);if(!v)throw Error('config');return v;}
function hex_(bytes){return bytes.map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');}
function digest_(bytes){return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes));}
function same_(a,b){if(typeof a!=='string'||a.length!==b.length)return false;var z=0;for(var i=0;i<a.length;i++)z|=a.charCodeAt(i)^b.charCodeAt(i);return z===0;}
function output_(v){return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON);}
function signed_(e,service,handler){var lock;try{
  var raw=e&&e.postData&&e.postData.contents;if(!raw||raw.length>12000000)throw Error('size');
  var p=JSON.parse(raw),secret=prop_('HMAC_KEY');if(secret.length<43||!Number.isSafeInteger(p.ts)||Math.abs(Date.now()-p.ts)>120000||!/^[a-f0-9-]{36}$/i.test(p.nonce||'')||typeof p.body!=='string')throw Error('auth');
  var signing=p.ts+'.'+p.nonce+'.'+p.body,mac=hex_(Utilities.computeHmacSha256Signature(signing,secret));
  if(!same_(p.mac,mac))throw Error('auth');
  lock=LockService.getScriptLock();lock.waitLock(15000);
  var cache=CacheService.getScriptCache(),nonceKey=service+':'+p.nonce;if(cache.get(nonceKey))throw Error('replay');cache.put(nonceKey,'1',180);
  var body=JSON.parse(p.body);return output_({ok:true,data:handler(body.action,body.data)});
 }catch(_){return output_({ok:false});}finally{if(lock&&lock.hasLock())lock.releaseLock();}}
// Reused from MESADEAYUDA/apps-script-drive/Code.gs (c592cbc), adapted to private clinical pilot.
function requireRestricted_(item){
 if(item.getSharingAccess()!==DriveApp.Access.PRIVATE)throw Error('restricted sharing required');
 return item;
}
function root_(){return requireRestricted_(DriveApp.getFolderById(prop_('ROOT_FOLDER_ID')));}
function getOrCreateFolder_(parent,name){
 const safeName=sanitizeName_(name||'General');
 const folders=parent.getFoldersByName(safeName);
 if(folders.hasNext()){const found=folders.next();if(folders.hasNext())throw Error('ambiguous folder');return requireRestricted_(found);}
 return requireRestricted_(parent.createFolder(safeName));
}
function existingFolder_(parent,name){
 const folders=parent.getFoldersByName(sanitizeName_(name));
 if(!folders.hasNext())throw Error('missing request');
 const found=folders.next();if(folders.hasNext())throw Error('ambiguous folder');
 return requireRestricted_(found);
}
function folder_(root,id){return getOrCreateFolder_(root,id);}
function saveFileToDrive_(folder,filename,bytes,mimeType){
 const cleanName=sanitizeFileName_(filename);
 const files=folder.getFilesByName(cleanName);
 if(files.hasNext()){const f=files.next();if(files.hasNext())throw Error('ambiguous file');return requireRestricted_(f);}
 const blob=Utilities.newBlob(bytes,mimeType,cleanName);
 return requireRestricted_(folder.createFile(blob));
}
// Read-only setup check: does not send email, create files, or print secrets.
function testConfiguration(){
 const folder=root_();
 if(prop_('HMAC_KEY').length<43||!/^https:\/\//.test(prop_('PORTAL_URL')))throw Error('config');
 const health=PropertiesService.getScriptProperties().getProperty('HEALTH_EMAIL');
 if(health&&!isValidEmail_(health))throw Error('config');
 console.log('Carpeta raíz: acceso general restringido. Revisar permisos individuales/heredados en Drive antes de habilitar el piloto.');
 console.log('Cupo de correo restante: '+MailApp.getRemainingDailyQuota());
}
function sanitizeName_(value) {
  return String(value || 'General')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'General';
}

function sanitizeFileName_(value) {
  return String(value || 'archivo')
    .replace(/[\\/:*?"<>|#%{}~&]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'archivo';
}

function isValidEmail_(email) {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email);
}
function savePdf_(folder,f){
 if(!/^[a-f0-9]{64}$/.test(f.sha||'')||['historia','apoyo','certificate'].indexOf(f.kind)<0||typeof f.base64!=='string'||f.base64.length>7000000)throw Error('file');
 var bytes=Utilities.base64Decode(f.base64);if(bytes.length>5*1024*1024||bytes.length<20||bytes[0]!==37||bytes[1]!==80||bytes[2]!==68||bytes[3]!==70||bytes[4]!==45||digest_(bytes)!==f.sha)throw Error('file');
 var filename=f.kind+'-'+f.sha+'.pdf',file=saveFileToDrive_(folder,filename,bytes,'application/pdf');
 return {kind:f.kind,fileId:file.getId(),sha:f.sha,size:bytes.length};
}


// Deploy as the Salud account; root folder private. Do not expose the shared secret.
function doPostArchive_(e){return signed_(e,'archive',function(a,d){
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

 // Temporary diagnostic only. Keep all archival operations HMAC-protected.
function doPost(e){
  if (e && e.parameter && e.parameter.probe === 'spark-auth-v1') {
    var step='app_check';
    try {
      if (!e.postData || e.postData.length>40000 ||
          !e.parameters || e.parameters.probe.length!==1 ||
          !e.parameters.appCheck || e.parameters.appCheck.length!==1 ||
          !e.parameters.idToken || e.parameters.idToken.length!==1) throw Error('invalid_request');
      sparkVerifyApp_(e.parameter.appCheck);
      step='identity';
      var identity=sparkIdentity_(e.parameter.idToken,true);
      return output_({ok:true,appCheck:'verified',identity:'verified',role:identity.role});
    } catch (_) {return output_({ok:false,stage:step});}
  }
  return doPostArchive_(e);
}
