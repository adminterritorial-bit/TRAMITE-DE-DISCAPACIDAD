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
