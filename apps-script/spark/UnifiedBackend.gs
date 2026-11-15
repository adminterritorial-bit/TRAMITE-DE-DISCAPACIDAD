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
function doGet(e){
 const enabled=PropertiesService.getScriptProperties().getProperty('SPARK_PILOT_ENABLED')==='true';
 if(e?.parameter?.content==='public'&&enabled){
  try{
   const cache=CacheService.getScriptCache(),key='institutional-public-v1';
   const previous=cache.get(key);
   const publicData=previous?JSON.parse(previous):{ok:true,notices:instNotices_('public'),policies:instPublished_()};
   if(!previous&&JSON.stringify(publicData).length<90000)cache.put(key,JSON.stringify(publicData),30);
   publicData.notices=publicData.notices.filter(x=>x.end>Date.now());
   return output_(publicData);
  }
  catch(_){return output_({ok:false,error:'firestore_unavailable'});}
 }
 return output_({ok:true,build:SPARK_BUILD_,enabled});
}
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
 if(!['requests','audit','rateLimits','institutional','institutionalVersions','legalEvidence','rightsCases'].includes(collection)||!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw Error('bad_id');
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

function spMail_(to,subject,message){
 const label='Alcaldía Municipal de San Pedro · Secretaría de Salud';
 const options={to,subject,body:label+'\n\n'+message+'\n\n'+SPARK_PORTAL_};
 function escaped(text){return text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 try{
  const response=UrlFetchApp.fetch(SPARK_PORTAL_.replace(/pilot\.html$/,'assets/brand/alcaldia-san-pedro.png'),{muteHttpExceptions:true});
  if(response.getResponseCode()===200&&digest_(response.getBlob().getBytes())==='acb2538438b975a6daf640a6c8e277edbc90807a8cbb97ec59320f5234855072'){
   options.inlineImages={alcaldia:response.getBlob().setName('alcaldia-san-pedro.png')};
   options.htmlBody='<img src="cid:alcaldia" alt="" width="192" height="108"><h1>'+escaped(label)+'</h1><p>'+escaped(message)+'</p><p><a href="'+SPARK_PORTAL_+'">Consultar en el portal</a></p>';
  }
 }catch(_){}
 MailApp.sendEmail(options);
}

function spAck_(folder,radicado,email,notify){
 if(!isValidEmail_(email)||!isValidEmail_(prop_('HEALTH_EMAIL')))throw Error('invalid_email');
 return spJournal_(folder,'ack.json',()=>{
  if(notify)spMail_(email,'Acuse de prueba '+radicado,'Se recibió su solicitud ficticia '+radicado+'.');
  spMail_(prop_('HEALTH_EMAIL'),'Nueva solicitud de prueba '+radicado,'Expediente ficticio '+radicado+'.');
 },notify?2:1);
}
function spSubmit_(u,d){
 if(d.consent!==true||d.synthetic!==true||d.noticeVersion!=='pilot-v1'||typeof d.key!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(d.key))throw Error('invalid_request');
 if(d.name!=='Persona de prueba'||d.documentType!=='CC'||d.documentNumber!=='TEST001'||d.phone!==''||d.support!==''||!['Cabecera municipal','Centro poblado','Zona rural dispersa'].includes(d.zone)||!['propia','apoyo'].includes(d.representation))throw Error('invalid_profile');
 if(!Array.isArray(d.files)||d.files.length<1||d.files.length>2)throw Error('invalid_fixture');
 var files=d.files.map((f,i)=>spFixture_(f,i?'apoyo':'historia'));
 if(files.reduce((s,f)=>s+f.size,0)>8*1024*1024)throw Error('invalid_fixture');
 var id=spHash_(u.uid+':'+d.key),radicado='SP-PIL-'+id.slice(0,16).toUpperCase(),prior=spRead_('requests',id);
 if(prior){if(spData_(prior.fields).ownerUid!==u.uid||!spRecord_(prior,false))throw Error('forbidden');return spRecord_(prior,false);}
 const evidence=instEvidence_(u,id,d.legalDecisions);
 spLimit_(u,'create',3);
 spCommit_([...evidence.writes,spPut_('requests',id,{ownerUid:u.uid,email:u.email,name:'Persona de prueba',documentType:'CC',documentNumber:'TEST001',phone:'',zone:d.zone,representation:d.representation,support:'',consent:true,synthetic:true,noticeVersion:'pilot-v1',radicado,status:'saving',ackStatus:'not_sent',notifyByEmail:evidence.notify},null,['createdAt','updatedAt']),spAudit_(id,u.uid,'created')]);
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
 try{ackStatus=spAck_(folder,radicado,u.email,evidence.notify)?'sent':'pending';}catch(_){}
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

const INST_ACTIONS_=['institutionalForm','institutionalPublic','institutionalAdmin','institutionalHistory','noticeSave','noticeChange','policySave','policyChange','evidenceList','rightsCreate','rightsMine','rightsInbox','rightsUpdate'];
const INST_POLICIES_=['processing','privacy','terms','storage','accessibility','sensitive'];
const INST_RIGHTS_=['access','update','rectification','suppression','proof','revocation'];
const INST_REFERENCE_=/^[a-f0-9-]{36}$/i;
function instText_(value,max){
 if(typeof value!=='string'||!value.trim()||value.length>max||/[<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value))throw Error('invalid_request');
 return value.trim();
}
function instEnum_(value,choices){
 if(!choices.includes(value))throw Error('invalid_request');
 return value;
}
function instDate_(value){
 if(!Number.isSafeInteger(value)||value<946684800000||value>4102444800000)throw Error('invalid_request');
 return value;
}
function instPermission_(u,property){
 return ['admin','supervisor'].includes(u?.role)&&String(PropertiesService.getScriptProperties().getProperty(property)||'').split(',').map(x=>x.trim()).includes(u.uid);
}
function instManager_(u){
 if(!['admin','supervisor'].includes(u?.role))throw Error('forbidden');
}
function instRecent_(u){
 if(!Number.isFinite(u.authTime)||Date.now()/1000-u.authTime>900)throw Error('recent_login_required');
}
function instLog_(entity,u,entry){
 return spPut_('institutionalVersions',Utilities.getUuid(),{entity,actorUid:u.uid,snapshot:entry},null,['at']);
}
function instRead_(collection,id){
 const doc=spRead_(collection,id);
 return {doc,data:doc?spData_(doc.fields):null};
}
function instNotices_(audience,now=Date.now()){
 const audiences=audience==='staff'?['staff','public']:audience==='citizen'?['citizen','public']:['public'];
 const entries=instRead_('institutional','notices').data?.items||[];
 return entries.map(x=>x.live).filter(x=>x&&audiences.includes(x.audience)&&x.start<=now&&x.end>now)
 .sort((a,b)=>b.priority-a.priority||a.start-b.start)
 .map(({id,title,body,start,end,priority,severity,audience,channel,frequency,service,version})=>({id,title,body,start,end,priority,severity,audience,channel,frequency,service,version}));
}
function instNotice_(u,action,d){
 instManager_(u);instRecent_(u);spLimit_(u,'notices',50);
 const {doc,data}=instRead_('institutional','notices'),items=data?.items||[];
 const index=d.id?items.findIndex(x=>x.id===d.id):-1;
 const current=items[index];
 if(d.id&&(!current||current.version!==d.version))throw Error('content_version_changed');
 let next;
 if(action==='noticeSave'){
  if(!current&&items.length>=40)throw Error('rate_limit');
  const start=instDate_(d.start),end=instDate_(d.end);
  if((d.channel==='modal'&&d.frequency==='always'&&d.severity!=='urgent')||end<=start||!Number.isSafeInteger(d.priority)||d.priority<0||d.priority>100)throw Error('invalid_request');
  const id=current?.id||Utilities.getUuid(),version=(current?.version||0)+1;
  const draft={id,version,title:instText_(d.title,100),body:instText_(d.body,1500),start,end,priority:d.priority,
   severity:instEnum_(d.severity,['info','warning','urgent']),audience:instEnum_(d.audience,['public','citizen','staff']),
   channel:instEnum_(d.channel,['banner','modal','inbox']),frequency:instEnum_(d.frequency,['session','always']),
   service:instEnum_(d.service,['all','discapacidad']),actorUid:u.uid};
  next={id,version,state:'draft',draft,live:current?.live||null};
 }else{
  if(!current)throw Error('not_found');
  if(d.state==='published'&&current.state==='draft'&&current.draft.end>Date.now()){
   next={...current,version:current.version+1,state:'published',live:current.draft};
  }else if(d.state==='withdrawn'&&current.live){
   next={...current,version:current.version+1,state:'withdrawn',live:null};
  }else throw Error('invalid_transition');
 }
 if(index<0)items.push(next);else items[index]=next;
 spCommit_([spPut_('institutional','notices',{items},doc,['updatedAt']),instLog_('notice-'+next.id,u,next)]);
 if(typeof CacheService!=='undefined')CacheService.getScriptCache().remove('institutional-public-v1');
 return next;
}
function instPolicy_(u,action,d){
 instManager_(u);instRecent_(u);spLimit_(u,'policy',50);
 const kind=instEnum_(d.kind,INST_POLICIES_),id='policy-'+kind;
 const {doc,data}=instRead_('institutional',id);
 const version=data?.version||0;
 if(d.version!==version)throw Error('content_version_changed');
 let next;
 if(action==='policySave'){
  const title=instText_(d.title,120),body=instText_(d.body,16000);
  const hash=spHash_(JSON.stringify([kind,title,body]));
  next={kind,version:version+1,state:'draft',draft:{title,body,hash,authorUid:u.uid},published:data?.published||null};
 }else if(d.state==='review'&&data?.state==='draft'){
  next={...data,state:'review',version:version+1};
 }else if(d.state==='approved'&&data?.state==='review'){
  if(!instPermission_(u,'LEGAL_REVIEWERS')||u.uid===data.draft.authorUid)throw Error('forbidden');
  next={...data,state:'approved',version:version+1,draft:{...data.draft,reviewerUid:u.uid,
   reference:instText_(d.reference,160),effective:instDate_(d.effective),approvedAt:Date.now()}};
 }else if(d.state==='published'&&data?.state==='approved'&&data.draft.effective<=Date.now()){
  if(kind==='sensitive')throw Error('pilot_disabled');
  const {title,body,hash,effective}=data.draft;
  next={...data,state:'published',version:version+1,published:{id,kind,title,body,hash,effective,version:version+1}};
 }else if(d.state==='withdrawn'&&data?.published){
  next={...data,state:'withdrawn',version:version+1,published:null};
 }else throw Error('invalid_transition');
 spCommit_([spPut_('institutional',id,next,doc,['updatedAt']),instLog_(id,u,next)]);
 if(typeof CacheService!=='undefined')CacheService.getScriptCache().remove('institutional-public-v1');
 return next;
}
function instPublished_(){
 return INST_POLICIES_.map(kind=>instRead_('institutional','policy-'+kind).data?.published).filter(x=>x&&x.effective<=Date.now());
}
const INST_PILOT_STATEMENTS_=[
 ['privacy','notice','Conocimiento del aviso del piloto','Comprendo que se usa mi cuenta verificada para operar una prueba con datos y PDF ficticios.'],
 ['terms','terms','Aceptación de condiciones de prueba','Acepto participar exclusivamente con el perfil y los documentos ficticios proporcionados.'],
 ['electronic','electronic_notice','Comunicaciones electrónicas opcionales','Autorizo que el acuse y los avisos de esta prueba lleguen a mi correo verificado.']
];
function instForm_(){
 const guards=[];
 const documents=INST_PILOT_STATEMENTS_.map(([kind,act,title,body])=>{
  const id='policy-'+kind;
  const policy=kind==='electronic'?null:instRead_('institutional',id);
  if(policy)guards.push({verify:spName_('institutional',id),currentDocument:policy.doc?{updateTime:policy.doc.updateTime}:{exists:false}});
  const published=policy?.data?.published;
  if(published&&published.effective<=Date.now())return {...published,act,required:true};
  return {id,version:1,hash:spHash_(JSON.stringify([kind,title,body])),title,body,act,required:act!=='electronic_notice'};
 });
 return {documents,guards};
}
function instEvidence_(u,id,decisions){
 const {documents,guards}=instForm_();
 if(!Array.isArray(decisions)||decisions.length!==documents.length)throw Error('legal_decision_required');
 let notify=false;
 const writes=documents.flatMap(item=>{
  const decision=decisions.find(d=>d?.id===item.id&&d.act===item.act);
  if(!decision)throw Error('legal_decision_required');
  if(decision.version!==item.version||decision.hash!==item.hash)throw Error('legal_version_changed');
  const valid=item.act==='notice'?['acknowledged']:item.act==='terms'?['accepted']:['granted','declined','unselected'];
  if(!valid.includes(decision.decision))throw Error('legal_decision_required');
  if(decision.decision==='unselected')return [];
  if(item.act==='electronic_notice')notify=decision.decision==='granted';
  const key=spHash_(id+':'+item.act);
  return spPut_('legalEvidence',key,{ownerUid:u.uid,requestId:id,documentId:item.id,version:item.version,
   hash:item.hash,act:item.act,decision:decision.decision,service:'discapacidad',purpose:'piloto_sintetico'},null,['at']);
 });
 return {writes:[...guards,...writes],notify};
}
function instRights_(u,action,d){
 const manage=action==='rightsInbox'||action==='rightsUpdate';
 if(manage&&!instPermission_(u,'DATA_RIGHTS_OFFICERS'))throw Error('forbidden');
 if(action==='rightsMine'||action==='rightsInbox'){
  spLimit_(u,'rightsList',60);
  return {items:spQuery_('rightsCases',manage?null:'ownerUid',u.uid,'createdAt',30).map(x=>{
   const item=spData_(x.fields);
   if(!manage)delete item.ownerUid;
   return item;
  })};
 }
 if(action==='rightsCreate'){
  const kind=instEnum_(d.kind,INST_RIGHTS_);
  if(!INST_REFERENCE_.test(d.key||''))throw Error('invalid_request');
  const id=spHash_(u.uid+':rights:'+d.key),p=instRead_('rightsCases',id);
  if(p.data)return {id,state:p.data.state};
  spLimit_(u,'rightsCreate',5);
  const configured=Number(PropertiesService.getScriptProperties().getProperty('RIGHTS_DUE_CALENDAR_DAYS'));
  const dueAt=Number.isSafeInteger(configured)&&configured>0&&configured<=90?Date.now()+configured*86400000:null;
  const next={id,kind,ownerUid:u.uid,version:1,state:'received',dueAt,assigneeUid:null,answer:null};
  spCommit_([spPut_('rightsCases',id,next,null,['createdAt','updatedAt']),spAudit_(id,u.uid,'rights:created')]);
  return {id,state:next.state};
 }
 instRecent_(u);
 if(!/^[a-f0-9]{64}$/.test(d.id||''))throw Error('invalid_request');
 const {doc,data}=instRead_('rightsCases',d.id);
 if(!data)throw Error('not_found');
 if(data.version!==d.version)throw Error('content_version_changed');
 let update;
 if(data.state==='received'&&d.state==='assigned')update={state:'assigned',assigneeUid:u.uid};
 else if(data.state==='assigned'&&data.assigneeUid===u.uid&&d.state==='answered')update={state:'answered',answer:instText_(d.answer,1800)};
 else throw Error('invalid_transition');
 spLimit_(u,'rightsUpdate',40);
 spCommit_([spPut_('rightsCases',d.id,{...update,version:data.version+1},doc,['updatedAt']),spAudit_(d.id,u.uid,'rights:'+update.state)]);
 return {id:d.id,state:update.state};
}
function instDispatch_(u,action,d){
 if(action==='institutionalForm'){
  spLimit_(u,'legalForm',120);
  return {documents:instForm_().documents};
 }
 if(action==='institutionalPublic'){
  spLimit_(u,'content',100);
  return {notices:instNotices_(u.role?'staff':'citizen'),policies:instPublished_()};
 }
 if(action==='institutionalAdmin'){
  instManager_(u);spLimit_(u,'contentAdmin',100);
  return {notices:instRead_('institutional','notices').data?.items||[],
   policies:INST_POLICIES_.map(kind=>instRead_('institutional','policy-'+kind).data).filter(Boolean),
   reviewer:instPermission_(u,'LEGAL_REVIEWERS'),rights:instPermission_(u,'DATA_RIGHTS_OFFICERS')};
 }
 if(action==='institutionalHistory'){
  instManager_(u);spLimit_(u,'contentHistory',70);
  if(!/^(?:policy-(?:processing|privacy|terms|storage|accessibility|sensitive)|notice-[a-f0-9-]{36})$/.test(d.entity||''))throw Error('invalid_request');
  return {items:spQuery_('institutionalVersions','entity',d.entity,'at',40).map(x=>spData_(x.fields))};
 }
 if(action==='evidenceList'){
  spLimit_(u,'evidenceList',100);
  return {items:spQuery_('legalEvidence','ownerUid',u.uid,'at',60).map(x=>spData_(x.fields))};
 }
 if(action==='noticeSave'||action==='noticeChange')return instNotice_(u,action,d);
 if(action==='policySave'||action==='policyChange')return instPolicy_(u,action,d);
 return instRights_(u,action,d);
}

function spDispatch_(u,action,d){
 if(INST_ACTIONS_.includes(action))return instDispatch_(u,action,d);
 if(action==='sessionAccess')return {role:u.role,canManage:!!u.role,canDeliver:u.role==='supervisor',institutional:true,build:SPARK_BUILD_};
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
   var sent=entry.notifyByEmail!==false&&spJournal_(folder,'delivery-'+f.sha+'.json',()=>spMail_(entry.email,'Documento de prueba '+entry.radicado,'Tiene un documento ficticio disponible, sin validez de certificado oficial.'),1);
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
  if(!req||![...INST_ACTIONS_,'sessionAccess','submitRequest','myRequests','adminList','adminHistory','setStatus','submitCorrection','downloadFile','sendCertificate'].includes(req.action)||!req.data||typeof req.data!=='object'||Array.isArray(req.data))throw Error('invalid_request');
  if(!INST_ACTIONS_.includes(req.action)){lock=LockService.getScriptLock();lock.waitLock(15000);}
  return output_({ok:true,build:SPARK_BUILD_,data:spDispatch_(u,req.action,req.data)});
 }catch(err){
  var safe=['pilot_disabled','rate_limit','invalid_fixture','invalid_profile','forbidden','invalid_transition','not_found','invalid_request','firestore_unavailable','recent_login_required','legal_decision_required','legal_version_changed','content_version_changed','not_enabled','invalid_identity','authorization_failed','invalid_app','invalid_token'];
  return output_({ok:false,build:SPARK_BUILD_,stage,error:safe.includes(err.message)?err.message:'operation_failed'});
 }finally{if(lock&&lock.hasLock())lock.releaseLock();}
}
