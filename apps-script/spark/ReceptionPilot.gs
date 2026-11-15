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
  if (e && e.parameter && e.parameter.probe === 'spark-pilot-v1') return spHandle_(e);
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

// Spark stage 1: closed synthetic-only operational pilot. No certificate or email action.
const SPARK_DB_='projects/tramite-discapacidad/databases/(default)/documents';
const SPARK_REST_='https://firestore.googleapis.com/v1/'+SPARK_DB_;
const SPARK_FIXTURE_='2238af7b677208cc3a3613d988dc43c0810284744e563e9ce88d646dfffbd5bf';
function spHash_(s){return digest_(Utilities.newBlob(s).getBytes());}
function spValue_(v){
 if(v===null)return {nullValue:null};
 if(typeof v==='string')return {stringValue:v};
 if(typeof v==='boolean')return {booleanValue:v};
 if(Number.isSafeInteger(v))return {integerValue:String(v)};
 if(Array.isArray(v))return {arrayValue:{values:v.map(spValue_)}};
 if(v&&typeof v==='object')return {mapValue:{fields:spFields_(v)}};
 throw Error('invalid_value');
}
function spFields_(data){var f={};Object.keys(data).forEach(k=>f[k]=spValue_(data[k]));return f;}
function spDecode_(v){
 if(!v)return null;
 if('stringValue'in v)return v.stringValue;
 if('booleanValue'in v)return v.booleanValue;
 if('integerValue'in v)return Number(v.integerValue);
 if('timestampValue'in v)return Date.parse(v.timestampValue);
 if('arrayValue'in v)return (v.arrayValue.values||[]).map(spDecode_);
 if('mapValue'in v)return spData_(v.mapValue.fields||{});
 return null;
}
function spData_(f){var d={};Object.keys(f||{}).forEach(k=>d[k]=spDecode_(f[k]));return d;}
function spRest_(suffix,method,data,allowMissing){
 var opts={method:method,headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true};
 if(data!==undefined){opts.contentType='application/json';opts.payload=JSON.stringify(data);}
 var res=UrlFetchApp.fetch(SPARK_REST_+suffix,opts),code=res.getResponseCode();
 if(code===404&&allowMissing)return null;
 if(code!==200)throw Error('firestore_unavailable');
 return JSON.parse(res.getContentText());
}
function spName_(collection,id){
 if(!['requests','audit','rateLimits'].includes(collection)||!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw Error('bad_id');
 return SPARK_DB_+'/'+collection+'/'+id;
}
function spRead_(collection,id){
 var name=spName_(collection,id);
 return spRest_('/'+name.slice(SPARK_DB_.length+1),'get',undefined,true);
}
function spPut_(collection,id,data,prior,timestamps){
 var w={update:{name:spName_(collection,id),fields:spFields_(data)},currentDocument:prior?{updateTime:prior.updateTime}:{exists:false}};
 if(prior)w.updateMask={fieldPaths:Object.keys(data)};
 if(timestamps&&timestamps.length)w.updateTransforms=timestamps.map(fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'}));
 return w;
}
function spCommit_(writes){return spRest_(':commit','post',{writes});}
function spAudit_(id,uid,action){return spPut_('audit',Utilities.getUuid(),{requestId:id,actorUid:uid,action},null,['at']);}
function spQuery_(collection,field,value,sort,max){
 var q={from:[{collectionId:collection}],orderBy:[{field:{fieldPath:sort},direction:'DESCENDING'}],limit:max};
 if(field)q.where={fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:spValue_(value)}};
 return spRest_(':runQuery','post',{structuredQuery:q}).filter(x=>x.document).map(x=>x.document);
}
function spLimit_(u,action,max){
 var key=spHash_(u.uid+':spark:'+action+':'+new Date().toISOString().slice(0,10));
 var old=spRead_('rateLimits',key),n=old?spData_(old.fields).count:0;
 if(!Number.isSafeInteger(n)||n<0||n>=max)throw Error('rate_limit');
 spCommit_([spPut_('rateLimits',key,{count:n+1,day:new Date().toISOString().slice(0,10)},old)]);
}
function spRequireAdmin_(u){if(!['operator','admin','supervisor'].includes(u.role))throw Error('forbidden');}
function spRecord_(doc,admin){
 var d=spData_(doc.fields);
 if(d.synthetic!==true||d.noticeVersion!=='pilot-v1'||d.name!=='Persona de prueba'||d.documentNumber!=='TEST001')return null;
 var id=doc.name.split('/').pop();
 return {id,radicado:d.radicado,status:d.status,createdAt:d.createdAt||0,updatedAt:d.updatedAt||0,ackStatus:d.ackStatus||'not_sent',...(admin?{name:d.name,files:(d.files||[]).map(f=>({kind:f.kind,size:f.size}))}: {})};
}
function spSubmit_(u,d){
 if(d.consent!==true||d.synthetic!==true||d.noticeVersion!=='pilot-v1'||typeof d.key!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(d.key))throw Error('invalid_request');
 if(typeof d.base64!=='string'||d.base64.length>7000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(d.base64))throw Error('invalid_fixture');
 var bytes=Utilities.base64Decode(d.base64);
 if(digest_(bytes)!==SPARK_FIXTURE_)throw Error('invalid_fixture');
 var id=spHash_(u.uid+':'+d.key),radicado='SP-PIL-'+id.slice(0,16).toUpperCase(),prior=spRead_('requests',id);
 if(prior){var old=spData_(prior.fields);if(old.ownerUid!==u.uid||old.synthetic!==true)throw Error('forbidden');return spRecord_(prior,false);}
 spLimit_(u,'create',3);
 spCommit_([spPut_('requests',id,{ownerUid:u.uid,email:u.email,name:'Persona de prueba',documentType:'CC',documentNumber:'TEST001',phone:'',zone:'Cabecera municipal',representation:'propia',support:'',consent:true,synthetic:true,noticeVersion:'pilot-v1',radicado,status:'saving',ackStatus:'not_sent'},null,['createdAt','updatedAt']),spAudit_(id,u.uid,'created')]);
 try{
  var f=savePdf_(folder_(root_(),id),{kind:'historia',sha:SPARK_FIXTURE_,base64:d.base64});
  var current=spRead_('requests',id);
  spCommit_([spPut_('requests',id,{files:[f],status:'received'},current,['updatedAt']),spAudit_(id,u.uid,'received')]);
 }catch(_){
  var current=spRead_('requests',id);
  if(current&&spData_(current.fields).status==='saving')spCommit_([spPut_('requests',id,{status:'storage_review'},current,['updatedAt']),spAudit_(id,u.uid,'storage_review')]);
 }
 return spRecord_(spRead_('requests',id),false);
}
function spDispatch_(u,action,d){
 if(action==='sessionAccess')return {role:u.role,canManage:!!u.role,build:'spark-pilot-1.1'};
 if(action==='submitRequest')return spSubmit_(u,d);
 if(action==='myRequests'){spLimit_(u,'list',100);return {items:spQuery_('requests','ownerUid',u.uid,'createdAt',50).map(x=>spRecord_(x,false)).filter(Boolean)};}
 spRequireAdmin_(u);
 if(action==='adminList'){spLimit_(u,'adminList',100);return {items:spQuery_('requests',null,null,'createdAt',50).map(x=>spRecord_(x,true)).filter(Boolean)};}
 if(!/^[a-f0-9]{64}$/.test(d.id||''))throw Error('invalid_request');
 var current=spRead_('requests',d.id);
 if(!current||!spRecord_(current,true))throw Error('not_found');
 if(action==='adminHistory'){
  spLimit_(u,'history',100);
  return {items:spQuery_('audit','requestId',d.id,'at',50).map(x=>{var a=spData_(x.fields);return {action:a.action,at:a.at};})};
 }
 if(action==='setStatus'){
  spLimit_(u,'review',30);
  var entry=spData_(current.fields),next={received:'reviewing',reviewing:'awaiting_certificate'}[entry.status];
  if(!next||next!==d.status)throw Error('invalid_transition');
  spCommit_([spPut_('requests',d.id,{status:next},current,['updatedAt']),spAudit_(d.id,u.uid,'status:'+next)]);
  return {status:next};
 }
 throw Error('invalid_action');
}
function spHandle_(e){
 var lock;
 try{
  if(prop_('SPARK_PILOT_ENABLED')!=='true')throw Error('pilot_disabled');
  if(!e.postData||e.postData.length>11000000||!e.parameters||!['probe','appCheck','idToken','payload'].every(k=>e.parameters[k]&&e.parameters[k].length===1))throw Error('invalid_request');
  sparkVerifyApp_(e.parameter.appCheck);
  var u=sparkIdentity_(e.parameter.idToken,false),p=JSON.parse(e.parameter.payload);
  if(!p||!['sessionAccess','submitRequest','myRequests','adminList','adminHistory','setStatus'].includes(p.action)||!p.data||typeof p.data!=='object'||Array.isArray(p.data))throw Error('invalid_request');
  lock=LockService.getScriptLock();lock.waitLock(15000);
  return output_({ok:true,data:spDispatch_(u,p.action,p.data)});
 }catch(err){
  var safe=['pilot_disabled','rate_limit','invalid_fixture','forbidden','invalid_transition','not_found','invalid_request','firestore_unavailable'];
  return output_({ok:false,error:safe.includes(err.message)?err.message:'operation_failed'});
 }finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
