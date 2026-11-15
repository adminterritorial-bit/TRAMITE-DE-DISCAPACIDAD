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



/** Spark unified closed pilot. Keep existing SparkAuth.gs, scopes and Script Properties. */
const SPARK_BUILD_='spark-unified-2.0';
const SPARK_PORTAL_='https://adminterritorial-bit.github.io/TRAMITE-DE-DISCAPACIDAD/pilot.html';
const SPARK_HASHES_=Object.freeze({historia:'2238af7b677208cc3a3613d988dc43c0810284744e563e9ce88d646dfffbd5bf',apoyo:'ca314bc71ca49c75ac2b9f4dc7102d7858e602fd13eaf49a6821afc581ad5dd4',certificate:'53ebb75b8e37218a3bad4b738acd05450d6703d7e88a40585919d5e64cef12fe'});
function doGet(){return output_({ok:true,build:SPARK_BUILD_,enabled:PropertiesService.getScriptProperties().getProperty('SPARK_PILOT_ENABLED')==='true'});}
function doPost(e){return spHandle_(e);}
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
 if(d.synthetic!==true||d.noticeVersion!=='pilot-v1'||d.name!=='Persona de prueba'||d.documentNumber!=='TEST001'||d.documentType!=='CC')return null;
 var id=doc.name.split('/').pop(),out={id,radicado:d.radicado,status:d.status,createdAt:d.createdAt||0,updatedAt:d.updatedAt||0,ackStatus:d.ackStatus||'not_sent',correctionKind:d.status==='needs_documents'?d.correction?.kind||null:null};
 if(admin)Object.assign(out,{name:d.name,email:d.email,documentType:d.documentType,documentNumber:d.documentNumber,phone:d.phone,zone:d.zone,representation:d.representation,support:d.support||'',files:(d.files||[]).map(f=>({kind:f.kind,size:f.size})),certificate:d.certificate?{kind:'certificate',size:d.certificate.size}:null});
 else out.certificateAvailable=!!d.certificate&&['sent','delivery_review','archived'].includes(d.status);
 return out;
}
function spFixture_(f,kind){
 if(!f||!Object.prototype.hasOwnProperty.call(SPARK_HASHES_,kind)||typeof f.base64!=='string'||f.base64.length>7000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(f.base64))throw Error('invalid_fixture');
 var bytes=Utilities.base64Decode(f.base64);
 if(bytes.length>5*1024*1024||digest_(bytes)!==SPARK_HASHES_[kind])throw Error('invalid_fixture');
 return {kind,sha:SPARK_HASHES_[kind],size:bytes.length,base64:f.base64};
}
function spUpdate_(current,id,uid,data,action){
 spCommit_([spPut_('requests',id,data,current,['updatedAt']),spAudit_(id,uid,action)]);
}
function spJournal_(folder,name,send,quota){
 var existing=folder.getFilesByName(name);
 if(existing.hasNext()){
  var item=requireRestricted_(existing.next());if(existing.hasNext())throw Error('delivery_uncertain');
  if(JSON.parse(item.getBlob().getDataAsString()).sent===true)return true;
  throw Error('delivery_uncertain');
 }
 if(MailApp.getRemainingDailyQuota()<quota)return false;
 var marker=requireRestricted_(folder.createFile(name,JSON.stringify({sent:false}),MimeType.PLAIN_TEXT));
 send();marker.setContent(JSON.stringify({sent:true}));return true;
}
function spAck_(folder,radicado,email){
 if(!isValidEmail_(email)||!isValidEmail_(prop_('HEALTH_EMAIL')))throw Error('invalid_email');
 return spJournal_(folder,'ack.json',()=>{
  MailApp.sendEmail({to:email,subject:'Acuse de prueba '+radicado,body:'Se recibió su solicitud ficticia '+radicado+'. No constituye radicación oficial. Consulte '+SPARK_PORTAL_});
  MailApp.sendEmail({to:prop_('HEALTH_EMAIL'),subject:'Nueva solicitud de prueba '+radicado,body:'Expediente ficticio '+radicado+'. Consulte '+SPARK_PORTAL_});
 },2);
}
function spSubmit_(u,d){
 if(d.consent!==true||d.synthetic!==true||d.noticeVersion!=='pilot-v1'||typeof d.key!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(d.key))throw Error('invalid_request');
 if(d.name!=='Persona de prueba'||d.documentType!=='CC'||d.documentNumber!=='TEST001'||d.phone!==''||d.support!==''||!['Cabecera municipal','Centro poblado','Zona rural dispersa'].includes(d.zone)||!['propia','apoyo'].includes(d.representation))throw Error('invalid_profile');
 if(!Array.isArray(d.files)||d.files.length<1||d.files.length>2)throw Error('invalid_fixture');
 var files=d.files.map((f,i)=>spFixture_(f,i?'apoyo':'historia'));
 if(files.reduce((s,f)=>s+f.size,0)>8*1024*1024)throw Error('invalid_fixture');
 var id=spHash_(u.uid+':'+d.key),radicado='SP-PIL-'+id.slice(0,16).toUpperCase(),prior=spRead_('requests',id);
 if(prior){if(spData_(prior.fields).ownerUid!==u.uid||!spRecord_(prior,false))throw Error('forbidden');return spRecord_(prior,false);}
 spLimit_(u,'create',3);
 spCommit_([spPut_('requests',id,{ownerUid:u.uid,email:u.email,name:'Persona de prueba',documentType:'CC',documentNumber:'TEST001',phone:'',zone:d.zone,representation:d.representation,support:'',consent:true,synthetic:true,noticeVersion:'pilot-v1',radicado,status:'saving',ackStatus:'not_sent'},null,['createdAt','updatedAt']),spAudit_(id,u.uid,'created')]);
 var folder;
 try{
  folder=folder_(root_(),id);
  var stored=files.map(f=>savePdf_(folder,f));
  spUpdate_(spRead_('requests',id),id,u.uid,{files:stored,status:'received'},'received');
 }catch(_){
  var current=spRead_('requests',id);
  if(current&&spData_(current.fields).status==='saving')spUpdate_(current,id,u.uid,{status:'storage_review'},'storage_review');
  return spRecord_(spRead_('requests',id),false);
 }
 var ackStatus='review';
 try{ackStatus=spAck_(folder,radicado,u.email)?'sent':'pending';}catch(_){}
 spUpdate_(spRead_('requests',id),id,u.uid,{ackStatus},'ack:'+ackStatus);
 return spRecord_(spRead_('requests',id),false);
}
function spDownload_(id,f,kind){
 if(!f||f.kind!==kind||f.sha!==SPARK_HASHES_[kind]||typeof f.fileId!=='string')throw Error('not_found');
 var folder=existingFolder_(root_(),id),file=requireRestricted_(DriveApp.getFileById(f.fileId)),parents=file.getParents(),valid=false;
 while(parents.hasNext()){if(parents.next().getId()===folder.getId())valid=true;}
 if(!valid||file.getMimeType()!=='application/pdf'||file.getSize()>5*1024*1024)throw Error('not_found');
 var bytes=file.getBlob().getBytes();if(digest_(bytes)!==f.sha)throw Error('invalid_fixture');
 return {base64:Utilities.base64Encode(bytes)};
}
function spDispatch_(u,action,d){
 if(action==='sessionAccess')return {role:u.role,canManage:!!u.role,canDeliver:u.role==='supervisor',build:SPARK_BUILD_};
 if(action==='submitRequest')return spSubmit_(u,d);
 if(action==='myRequests'){spLimit_(u,'list',100);return {items:spQuery_('requests','ownerUid',u.uid,'createdAt',50).filter(x=>spData_(x.fields).ownerUid===u.uid).map(x=>spRecord_(x,false)).filter(Boolean)};}
 if(action==='adminList'){spRequireAdmin_(u);spLimit_(u,'adminList',100);return {items:spQuery_('requests',null,null,'createdAt',50).map(x=>spRecord_(x,true)).filter(Boolean),role:u.role};}
 if(!/^[a-f0-9]{64}$/.test(d.id||''))throw Error('invalid_request');
 var current=spRead_('requests',d.id);
 if(!current||!spRecord_(current,true))throw Error('not_found');
 var entry=spData_(current.fields),owner=entry.ownerUid===u.uid;
 if(action==='submitCorrection'){
  if(!owner)throw Error('not_found');
  if(entry.status!=='needs_documents'||!entry.correction?.kind)throw Error('invalid_transition');
  var f=spFixture_(d.file,entry.correction.kind);spLimit_(u,'correction',10);
  var saved=savePdf_(existingFolder_(root_(),d.id),f),files=(entry.files||[]).filter(x=>x.kind!==saved.kind);files.push(saved);
  spUpdate_(current,d.id,u.uid,{files,status:'reviewing',correction:null},'correction_received:'+saved.kind);
  return {status:'reviewing'};
 }
 if(action==='downloadFile'){
  var isAdmin=['operator','admin','supervisor'].includes(u.role);
  if(!isAdmin&&!(owner&&d.kind==='certificate'&&['sent','archived','delivery_review'].includes(entry.status)))throw Error('not_found');
  if(!Object.prototype.hasOwnProperty.call(SPARK_HASHES_,d.kind))throw Error('not_found');
  spLimit_(u,'download',100);
  var result=spDownload_(d.id,d.kind==='certificate'?entry.certificate:(entry.files||[]).find(f=>f.kind===d.kind),d.kind);
  spCommit_([spAudit_(d.id,u.uid,'download:'+d.kind)]);return result;
 }
 spRequireAdmin_(u);
 if(action==='adminHistory'){
  spLimit_(u,'history',100);
  return {items:spQuery_('audit','requestId',d.id,'at',50).filter(x=>spData_(x.fields).requestId===d.id).map(x=>{var a=spData_(x.fields);return {action:a.action,at:a.at,actorUid:a.actorUid};})};
 }
 if(action==='setStatus'){
  var allowed={received:['reviewing'],reviewing:['needs_documents','awaiting_certificate'],needs_documents:['reviewing']};
  if(!allowed[entry.status]?.includes(d.status))throw Error('invalid_transition');
  var correction=null;
  if(d.status==='needs_documents'){if(!['historia','apoyo'].includes(d.documentKind))throw Error('invalid_request');correction={kind:d.documentKind,id:Utilities.getUuid()};}
  spLimit_(u,'review',30);spUpdate_(current,d.id,u.uid,{status:d.status,correction},correction?'correction_requested:'+correction.kind:'status:'+d.status);return {ok:true};
 }
 if(action==='sendCertificate'){
  if(u.role!=='supervisor')throw Error('forbidden');
  if(!Number.isFinite(u.authTime)||Date.now()/1000-u.authTime>900)throw Error('recent_login_required');
  if(entry.status!=='awaiting_certificate'||entry.consent!==true||d.confirm!==true)throw Error('invalid_transition');
  var f=spFixture_(d.file,'certificate');if(!isValidEmail_(entry.email)||!/^SP-PIL-[A-F0-9]{16}$/.test(entry.radicado))throw Error('invalid_request');
  spLimit_(u,'send',30);spUpdate_(current,d.id,u.uid,{status:'sending'},'delivery_requested');
  var cert=null,status='delivery_review';
  try{
   var folder=existingFolder_(root_(),d.id);cert=savePdf_(folder,f);
   var sent=spJournal_(folder,'delivery-'+f.sha+'.json',()=>MailApp.sendEmail({to:entry.email,subject:'Documento de prueba '+entry.radicado,body:'Tiene un documento ficticio disponible. No es un certificado oficial. Consulte '+SPARK_PORTAL_}),1);
   status=sent?'sent':'archived';
  }catch(_){}
  var update={status};if(cert)update.certificate=cert;
  spUpdate_(spRead_('requests',d.id),d.id,u.uid,update,status==='sent'?'notification_sent':status);
  return {status};
 }
 throw Error('invalid_action');
}
function spParse_(e){
 if(!e||!e.postData||e.postData.length>12000000)throw Error('invalid_request');
 var p=e.parameter||{}, fields=e.parameters||{};
 if(p.probe!=='spark-pilot-v1'||!['probe','appCheck','idToken','payload'].every(k=>fields[k]&&fields[k].length===1&&typeof p[k]==='string'))throw Error('invalid_request');
 return p;
}
function spHandle_(e){
 var lock,stage='configuration';
 try{
  if(PropertiesService.getScriptProperties().getProperty('SPARK_PILOT_ENABLED')!=='true')throw Error('pilot_disabled');
  stage='request';var p=spParse_(e);
  stage='app_check';sparkVerifyApp_(p.appCheck);
  stage='identity';var u=sparkIdentity_(p.idToken,false);
  stage='operation';var req=JSON.parse(p.payload);
  if(!req||!['sessionAccess','submitRequest','myRequests','adminList','adminHistory','setStatus','submitCorrection','downloadFile','sendCertificate'].includes(req.action)||!req.data||typeof req.data!=='object'||Array.isArray(req.data))throw Error('invalid_request');
  lock=LockService.getScriptLock();lock.waitLock(15000);
  return output_({ok:true,build:SPARK_BUILD_,data:spDispatch_(u,req.action,req.data)});
 }catch(err){
  var safe=['pilot_disabled','rate_limit','invalid_fixture','invalid_profile','forbidden','invalid_transition','not_found','invalid_request','firestore_unavailable','recent_login_required','not_enabled','invalid_identity','authorization_failed','invalid_app','invalid_token'];
  return output_({ok:false,build:SPARK_BUILD_,stage,error:safe.includes(err.message)?err.message:'operation_failed'});
 }finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
