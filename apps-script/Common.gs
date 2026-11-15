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
function folder_(root,id){var it=root.getFoldersByName(id);return it.hasNext()?it.next():root.createFolder(id);}
function savePdf_(folder,f){
 if(!/^[a-f0-9]{64}$/.test(f.sha||'')||['historia','apoyo','certificate'].indexOf(f.kind)<0||typeof f.base64!=='string'||f.base64.length>7000000)throw Error('file');
 var bytes=Utilities.base64Decode(f.base64);if(bytes.length>5*1024*1024||bytes.length<20||bytes[0]!==37||bytes[1]!==80||bytes[2]!==68||bytes[3]!==70||bytes[4]!==45||digest_(bytes)!==f.sha)throw Error('file');
 var filename=f.kind+'-'+f.sha+'.pdf',it=folder.getFilesByName(filename),file=it.hasNext()?it.next():folder.createFile(Utilities.newBlob(bytes,'application/pdf',filename));
 return {kind:f.kind,fileId:file.getId(),sha:f.sha,size:bytes.length};
}
