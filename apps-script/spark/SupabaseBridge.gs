// SITS Salud / Supabase backend adapter. No clinical file bytes are sent to Supabase.
// Staged: the original Firebase handlers remain available until an authorized cutover.
// Script Properties (server-side, never public): SITS_BACKEND_MODE=supabase,
// SITS_SB_PUBLISHABLE_KEY, SITS_SB_SECRET_KEY (or legacy SITS_SB_SERVICE_ROLE_JWT).
// Keep existing ROOT_FOLDER_ID and Google Drive/MailApp.
const SITS_SB_FORCE_TEST_=false;
const SITS_SB_URL_='https://ovppffchdkwbikdppuzh.supabase.co';
const SITS_SB_ACTIONS_=[
 'sessionAccess','officialSubmit','configuredSubmit','officialMine','officialInbox','officialRead',
 'officialDownload','officialCorrect','officialTransition',
 'officialSendCertificate','officialVerifyDelivery'
];
function sitsSbOn_(){
 const mode=PropertiesService.getScriptProperties().getProperty('SITS_BACKEND_MODE');
 return mode==='dual'||mode==='supabase';
}
function sitsSbProp_(key){
 const v=PropertiesService.getScriptProperties().getProperty(key);
 if(!v)throw Error('configuration_missing');
 return v;
}
function sitsSbCall_(path,method,data,accessToken,server,returnMinimal=false){
 const props=PropertiesService.getScriptProperties();
 const apiKey=server?(props.getProperty('SITS_SB_SECRET_KEY')||
  sitsSbProp_('SITS_SB_SERVICE_ROLE_JWT')):sitsSbProp_('SITS_SB_PUBLISHABLE_KEY');
 const token=server?apiKey:accessToken;
 if(!token)throw Error('not_authenticated');
 const opts={
  method:method||'get',muteHttpExceptions:true,
  headers:{apikey:apiKey,Accept:'application/json'},
 };
 // Modern sb_publishable/sb_secret keys belong in apikey only, not in Bearer.
 if(token!==apiKey || token.indexOf('sb_')!==0)
  opts.headers.Authorization='Bearer '+token;
 if(method==='post'||method==='patch'){
  opts.contentType='application/json';opts.payload=JSON.stringify(data);
  opts.headers.Prefer=returnMinimal?'return=minimal':'return=representation';
 }
 const response=UrlFetchApp.fetch(SITS_SB_URL_+'/'+path,opts);
 const status=response.getResponseCode();
 const body=response.getContentText();
 if(status>=200&&status<300&&!body.trim())return null;
 let parsed;
 try{parsed=JSON.parse(body);}catch(_){throw Error('database_unavailable');}
 if(status<200||status>=300){
  // Only generic codes leave the server; don't log or echo SQL, PII, tokens or internal traces.
  if(status===404&&parsed?.code==='PGRST202')throw Error('rpc_unavailable');
  if(status===401)throw Error('not_authenticated');
  const rules=['pilot_disabled','legal_version_changed','legal_decision_required',
   'invalid_profile','invalid_transition','content_version_changed','revision_conflict'];
  if(rules.includes(parsed?.message))throw Error(parsed.message);
  if(status===403)throw Error('forbidden');
  if(status===409||parsed?.code==='23505')throw Error('revision_conflict');
  if(status>=500)throw Error('database_unavailable');
  throw Error('invalid_request');
 }
 return parsed;
}
function sitsSbRpc_(name,payload,token,server){
 return sitsSbCall_('rest/v1/rpc/'+name,'post',payload||{},token,server);
}
function sitsSbRows_(table,query,token,server){
 const result=sitsSbCall_('rest/v1/'+table+'?'+query,'get',null,token,server);
 if(!Array.isArray(result))throw Error('database_unavailable');
 return result;
}
function sitsSbSession_(token){
 const user=sitsSbCall_('auth/v1/user','get',null,token,false);
 if(!user||!user.id||!user.email||!user.email_confirmed_at)throw Error('not_authenticated');
 let access=sitsSbRpc_('sits_session_access',{},token,false);
 if(!access.role&&user.email.toLowerCase().endsWith('@sanpedro-valle.gov.co')){
  try{access=sitsSbRpc_('sits_claim_staff_invitation',{},token,false);}catch(_){}
 }
 // Supabase Auth has already validated this JWT and resolved the user.
 const claims=sparkClaims_(token),authTime=Math.max(0,...(claims.amr||[])
  .map(entry=>Number(entry.timestamp)).filter(Number.isFinite));
 return {uid:user.id,email:user.email,authTime,role:access.role||null,
  canManage:access.canManage===true,institutional:access.institutional===true};
}
function sitsSbCapabilities_(){
 const list=sitsSbRows_('sits_legal_documents',
  'select=id,kind,title,body,version,content_hash&active=eq.true&order=kind.asc',
  sitsSbProp_('SITS_SB_PUBLISHABLE_KEY'),false);
 const required=['processing','privacy','terms','sensitive'];
 if(required.some(kind=>list.filter(x=>x.kind===kind).length!==1))throw Error('legal_version_changed');
 let acceptingRequests=null;
 try{acceptingRequests=!sitsSbTestMode_()&&sitsSbRpc_('sits_intake_availability',{},sitsSbProp_('SITS_SB_PUBLISHABLE_KEY'),false)===true;}
 catch(e){if(e.message!=='rpc_unavailable')throw e;}
 return {enabled:true,acceptingRequests:acceptingRequests,documents:list.filter(x=>required.includes(x.kind))
  .map(x=>({id:x.id,kind:x.kind,title:x.title,body:x.body,version:x.version,hash:x.content_hash}))};
}
function sitsSbRowsQuery_(){
 return 'select=*,sits_case_documents(id,kind,bytes,sha256,version),sits_case_events(action,new_status,comment,created_at)';
}
function sitsSbCase_(id,token){
 if(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))throw Error('invalid_request');
 const rows=sitsSbRows_('sits_cases',sitsSbRowsQuery_()+
  '&id=eq.'+encodeURIComponent(id)+'&limit=1',token,false);
 if(rows.length!==1)throw Error('not_found');
 return rows[0];
}
function sitsSbView_(row,staff){
 const docs=Array.isArray(row.sits_case_documents)?row.sits_case_documents:[];
 const events=Array.isArray(row.sits_case_events)?row.sits_case_events:[];
 const visible=docs.filter(d=>d.kind!=='certificate');
 const certificate=docs.filter(d=>d.kind==='certificate').sort((a,b)=>b.version-a.version)[0];
 const x={
  id:row.id,reference:row.reference,status:row.status,revision:row.revision,
  serviceId:row.service_id,serviceVersion:row.service_schema_version||null,
  createdAt:row.created_at,updatedAt:row.updated_at,
  files:visible.map(f=>({kind:f.kind,size:f.bytes})),
  correctionKind:row.correction_kind,
  certificateAvailable:!!certificate&&['delivered','available','delivery_review','closed'].includes(row.status),
  deliveryMethod:row.delivery_method,
  history:events.slice().sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at))
   .slice(-25).map(e=>({status:e.new_status||e.action,at:e.created_at,comment:e.comment||''}))
 };
 if(staff)Object.assign(x,{name:row.applicant_name,email:row.owner_email,
  documentType:row.document_type,documentNumber:row.document_number,
  zone:row.residence_zone,representation:row.representation,phone:row.phone,
  support:row.support_needed,certificateEmailConsent:row.certificate_email_consent,
  certificate:certificate?{kind:'certificate',size:certificate.bytes}:null,
  deliveryStatus:row.delivery_status});
 return x;
}
function sitsSbStore_(c,files){
 const folder=folder_(root_(),'official-'+c.id);
 for(let i=0;i<files.length;i++){
  const stored=savePdf_(folder,files[i]);
  // Check the actual object even when Drive returned a previously named file.
  const saved=requireRestricted_(DriveApp.getFileById(stored.fileId));
  if(saved.getMimeType()!=='application/pdf'||saved.getSize()!==stored.size
   ||digest_(saved.getBlob().getBytes())!==stored.sha)
   throw Error('document_integrity_failed');
  sitsSbRpc_('sits_drive_document_saved',{
   _case_id:c.id,_kind:stored.kind,_drive_file_id:stored.fileId,
   _sha256:stored.sha,_bytes:stored.size,
   _filename:stored.kind+'-'+stored.sha+'.pdf',_complete:i===files.length-1
  },null,true);
 }
 return folder;
}
function sitsSbAccessFile_(row,kind,token,user){
 const docs=(row.sits_case_documents||[]).filter(d=>d.kind===kind)
  .sort((a,b)=>b.version-a.version);
 if(!docs.length)throw Error('not_found');
 if(kind==='certificate'&&user.uid===row.owner_user_id
   &&!['delivered','available','delivery_review','closed'].includes(row.status))throw Error('not_found');
 const doc=docs[0];
 const fileId=sitsSbRpc_('sits_drive_document_reference',{_document_id:doc.id},null,true);
 const folder=existingFolder_(root_(),'official-'+row.id);
 const file=requireRestricted_(DriveApp.getFileById(fileId));
 const parents=file.getParents();let inFolder=false;
 while(parents.hasNext())if(parents.next().getId()===folder.getId())inFolder=true;
 if(!inFolder||file.getMimeType()!=='application/pdf'||file.getSize()!==doc.bytes)
  throw Error('document_integrity_failed');
 const bytes=file.getBlob().getBytes();
 if(digest_(bytes)!==doc.sha256)throw Error('document_integrity_failed');
 sitsSbCall_('rest/v1/sits_audit_events','post',{
  actor_user_id:user.uid,case_id:row.id,event_type:'document:download',
  entity_type:'document',entity_id:doc.id,details:{kind:kind}
 },null,true,true);
 return {base64:Utilities.base64Encode(bytes),kind:kind};
}
function sitsSbDispatch_(u,action,d,token){
 if(action==='sessionAccess')return {
  role:u.role,canManage:u.canManage,institutional:u.institutional,
  testIntake:sitsSbTestMode_()&&sitsSbTestAccount_(u.email)
 };
 if(INST_ACTIONS_.includes(action)||CATALOG_ACTIONS_.includes(action)){
  return sitsPortalRun_(()=>{
   if(['staffList','staffSave','staffInvite','staffRevokeInvite'].includes(action))
    return sitsPortalStaff_(u,action,d);
   return INST_ACTIONS_.includes(action)?instDispatch_(u,action,d):catDispatch_(u,action,d);
  });
 }
 if(action==='officialSubmit'||action==='configuredSubmit'){
  // Both services use the same official Supabase ledger and verified Drive
  // storage path. Configured intake is independently disabled by default.
  const configured=action==='configuredSubmit';
  const files=officialFiles_(d.files||[]);
  const payload=JSON.parse(JSON.stringify(d));delete payload.files;
  if(configured){
   payload.documentKinds=files.map(file=>file.kind);
   if(typeof payload.serviceId!=='string'||payload.serviceId==='certificacion-discapacidad')
    throw Error('invalid_request');
  }
  sitsPortalRun_(()=>spLimit_(u,configured?'configuredSubmit':'officialSubmit',3));
  const operation=configured?'sits_create_configured_case':'sits_create_case';
  const c=sitsSbRpc_(operation,{_payload:payload},token,false);
  let folder;
  if(['saving','storage_review'].includes(c.status)){
   try{folder=sitsSbStore_(c,files);}
   catch(_){
    if(c.status==='saving'){
     try{sitsSbCall_('rest/v1/sits_cases?id=eq.'+c.id+'&status=eq.saving&revision=eq.'+c.revision,
      'patch',{status:'storage_review',revision:c.revision+1,last_action:'Soportes por verificar'},null,true);}
     catch(_2){}
    }
   }
  }
  const received=sitsSbCase_(c.id,token);
  if(received.status==='received'&&received.notify_by_email===true){
   const verifiedFolder=folder||(configured&&files.length===0?folder_(root_(),'official-'+c.id):null);
   if(verifiedFolder)sitsSbAcknowledge_(verifiedFolder,received);
  }
  return sitsSbView_(received,false);
 }
 if(action==='officialMine'||action==='officialInbox'){
  const staff=action==='officialInbox';
  if(staff&&!u.canManage)throw Error('forbidden');
  try{
   return sitsSbRpc_('sits_case_workspace',{_staff:staff,_filters:d},token,false);
  }catch(e){if(e.message!=='rpc_unavailable')throw e;}
  // Compatibility while the read-only database migration is being installed.
  const query=staff?'&order=created_at.desc&limit=100':
   '&owner_user_id=eq.'+encodeURIComponent(u.uid)+'&order=created_at.desc&limit=50';
  const rows=sitsSbRows_('sits_cases',sitsSbRowsQuery_()+query,token,false);
  return {items:rows.map(r=>sitsSbView_(r,staff))};
 }
 const c=sitsSbCase_(d.id,token),isOwner=c.owner_user_id===u.uid;
 if(!isOwner&&!u.canManage)throw Error('forbidden');
 if(sitsSbTestMode_()&&(c.applicant_name!=='Persona de prueba'||c.document_number!=='TEST001'
   ||!sitsSbTestAccount_(c.owner_email)))throw Error('not_found');
 if(action==='officialRead')return sitsSbView_(c,u.canManage);
 if(action==='officialDownload'){
  if(!['historia','apoyo','certificate'].includes(d.kind))throw Error('invalid_request');
  if(!isOwner)instRecent_(u);
  return sitsSbAccessFile_(c,d.kind,token,u);
 }
 if(action==='officialTransition'){
  if(!u.canManage)throw Error('forbidden');
  const transition=sitsSbRpc_('sits_staff_transition',{_case_id:c.id,_revision:d.revision,
   _status:d.status,_comment:d.comment||'',_document_kind:d.documentKind||null},token,false);
  if(c.notify_by_email===true&&['needs_documents','awaiting_certificate','not_proceed'].includes(transition.status)){
   const requested=transition.status==='needs_documents';
   sitsSbNotify_(c,'official-update-'+transition.revision+'.json',
    requested?'Subsanación requerida':'Actualización de solicitud',
    requested?'Consulta en el portal el soporte solicitado y el motivo de la subsanación.':
     'Hay una nueva actuación disponible en el seguimiento de tu solicitud.');
  }
  return sitsSbView_(sitsSbCase_(c.id,token),true);
 }
 if(action==='officialCorrect'){
  if(!isOwner||c.status!=='needs_documents'||c.revision!==d.revision)
   throw Error('invalid_transition');
  const files=officialFiles_([d.file],true);
  if(files.length!==1||files[0].kind!==c.correction_kind)throw Error('invalid_request');
  sitsPortalRun_(()=>spLimit_(u,'officialCorrect',12));
  sitsSbStore_(c,files);
  return sitsSbView_(sitsSbCase_(c.id,token),false);
 }
 if(action==='officialSendCertificate'){
  if(!u.canManage||c.status!=='awaiting_certificate'||c.revision!==d.revision||d.confirm!==true)
   throw Error('invalid_transition');
  instRecent_(u);
  const file=officialCertificateFile_(d.file);
  const folder=sitsSbStore_(c,[file]);
  const sentByEmail=c.certificate_email_consent===true;
  try{
   if(sentByEmail){
    const journal='certificado-correo-'+file.sha.slice(0,24)+'.json';
    const accepted=spJournal_(folder,journal,()=>{
     officialCertificateMail_(c.owner_email,c.reference,file,sitsSbTestMode_());
    },1);
    if(!accepted)throw Error('delivery_uncertain');
   }
   sitsSbRpc_('sits_drive_delivery_result',{
    _case_id:c.id,_result:'confirmed',_provider_message_id:null
   },null,true);
  }catch(_){
   // Delivery might already have occurred. Do not automatically resend.
   try{sitsSbRpc_('sits_drive_delivery_result',{
    _case_id:c.id,_result:'uncertain',_provider_message_id:null
   },null,true);}catch(_2){}
  }
  return sitsSbView_(sitsSbCase_(c.id,token),true);
 }
 if(action==='officialVerifyDelivery'){
  if(!u.canManage||c.status!=='delivery_review'||c.revision!==d.revision||d.confirm!==true
   ||c.delivery_method!=='email')throw Error('invalid_transition');
  const cert=(c.sits_case_documents||[]).filter(x=>x.kind==='certificate')
   .sort((a,b)=>b.version-a.version)[0];
  if(!cert)throw Error('not_found');
  const folder=existingFolder_(root_(),'official-'+c.id);
  const journal='certificado-correo-'+cert.sha256.slice(0,24)+'.json';
  const files=folder.getFilesByName(journal);
  if(!files.hasNext())throw Error('delivery_uncertain');
  const marker=requireRestricted_(files.next());if(files.hasNext())throw Error('delivery_uncertain');
  let delivered=false;
  try{delivered=JSON.parse(marker.getBlob().getDataAsString()).sent===true;}catch(_){}
  if(!delivered)throw Error('delivery_uncertain');
  sitsSbRpc_('sits_drive_delivery_result',{
   _case_id:c.id,_result:'confirmed',_provider_message_id:null
  },null,true);
  return sitsSbView_(sitsSbCase_(c.id,token),true);
 }
 throw Error('invalid_request');
}
function sitsSbAcknowledge_(folder,row){
 return sitsSbNotify_(row,'official-ack.json','Solicitud recibida',
  'Puedes consultar el estado desde tu cuenta. Este mensaje no es un certificado.',folder);
}
function sitsSbNotify_(row,journal,subject,text,folder){
 const lock=LockService.getScriptLock();
 let state='failed', attempted=false;
 try{
  lock.waitLock(15000);
  folder=folder||existingFolder_(root_(),'official-'+row.id);
  const test=sitsSbTestMode_();
  const title=(test?'[PRUEBA] ':'')+subject+' · '+row.reference;
  const message=(test?'Solicitud ficticia para verificar el servicio. ':'')+
   'Referencia '+row.reference+'. '+text;
  state=spJournal_(folder,journal,()=>{
   attempted=true;
   spMail_(row.owner_email,title,message);
  },1)?'confirmed':'failed';
 }catch(error){
  if(attempted||error.message==='delivery_uncertain')state='uncertain';
 }finally{if(lock.hasLock())lock.releaseLock();}
 try{
  sitsSbCall_('rest/v1/sits_audit_events','post',{
   case_id:row.id,event_type:'notification:'+state,entity_type:'case',
   entity_id:row.id,details:{operation:journal}
  },null,true,true);
 }catch(_){}
 return state;
}
function sitsSbHandle_(e){
 let stage='request',lock;
 try{
  if(!sitsSbOn_())throw Error('pilot_disabled');
  if(!e||!e.parameter||e.parameter.probe!=='sits-supabase-v1'
   ||!e.parameter.accessToken||!e.parameter.payload
   ||e.postData&&e.postData.length>12000000)throw Error('invalid_request');
  const req=JSON.parse(e.parameter.payload);
  if(!req||![...SITS_SB_ACTIONS_,...INST_ACTIONS_,...CATALOG_ACTIONS_].includes(req.action)||!req.data
   ||typeof req.data!=='object'||Array.isArray(req.data))throw Error('invalid_request');
  stage='identity';
  const user=sitsSbSession_(e.parameter.accessToken);
  stage='operation';
  sitsSbTestGuard_(user,req.action,req.data);
  if(req.action==='officialSendCertificate'){
   lock=LockService.getScriptLock();
   lock.waitLock(15000);
  }
  const result=sitsSbDispatch_(user,req.action,req.data,e.parameter.accessToken);
  return output_({ok:true,build:'sits-supabase-1.0',data:result});
 }catch(err){
  const known=['not_authenticated','forbidden','not_found','invalid_request',
   'invalid_transition','revision_conflict','database_unavailable','pilot_disabled',
   'legal_version_changed','delivery_uncertain','invalid_fixture','document_integrity_failed',
   'content_version_changed','legal_decision_required','rate_limit','recent_login_required',
   'invalid_profile','not_enabled','service_not_open','invalid_service_schema',
   'document_required','main_document_required','idempotency_mismatch'];
  return output_({ok:false,build:'sits-supabase-1.0',stage:stage,
   error:known.includes(err.message)?err.message:'operation_failed'});
 }finally{if(lock&&lock.hasLock())lock.releaseLock();}
}

// Dual mode defaults to a closed test allowlist and exact bundled PDF hashes.
function sitsSbTestMode_(){
 return SITS_SB_FORCE_TEST_||PropertiesService.getScriptProperties().getProperty('SITS_BACKEND_MODE')==='dual';
}
function sitsSbTestAccount_(email){
 const props=PropertiesService.getScriptProperties();
 const emails=String(props.getProperty('SITS_SB_TEST_EMAILS')||'').split(',')
  .map(value=>value.trim().toLowerCase()).filter(Boolean);
 return typeof email==='string'&&emails.includes(email.toLowerCase());
}
function sitsSbTestGuard_(user,action,data){
 if(!sitsSbTestMode_())return;
 if(!sitsSbTestAccount_(user.email))throw Error('not_enabled');
 if(action==='configuredSubmit')throw Error('not_enabled');
 if(action==='officialSubmit'){
  if(data.name!=='Persona de prueba'||data.documentNumber!=='TEST001')throw Error('invalid_profile');
  officialFiles_(data.files).forEach(file=>{if(file.sha!==SPARK_HASHES_[file.kind])throw Error('invalid_fixture');});
 }
 if(action==='officialCorrect'){
  const [file]=officialFiles_([data.file],true);
  if(file.sha!==SPARK_HASHES_[file.kind])throw Error('invalid_fixture');
 }
 if(action==='officialSendCertificate'){
  const file=officialCertificateFile_(data.file);
  if(file.sha!==SPARK_HASHES_.certificate)throw Error('invalid_fixture');
 }
}
