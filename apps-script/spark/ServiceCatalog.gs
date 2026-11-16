const CATALOG_ACTIONS_=['catalogList','catalogAdmin','categorySave','categoryRetire','serviceRead','serviceSave','serviceDuplicate',
 'servicePublish','serviceRetire','serviceHistory','serviceApply','serviceMine','serviceInbox','serviceCase','serviceTransition',
 'serviceAssign','serviceDownload','serviceNote','serviceRetryMail','serviceRequestCorrection','serviceSubmitCorrection','serviceExport','staffList','staffSave'];
const CATALOG_ID_=/^[a-z][a-z0-9-]{1,39}$/;
const CATALOG_KEY_=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATALOG_USER_=/^[A-Za-z0-9_-]{1,128}$/;
const CATALOG_TYPES_=['text','textarea','number','date','select','radio','checkbox','document'];
const CATALOG_BASE_=Object.freeze({id:'discapacidad',version:1,title:'Certificación de discapacidad',
 description:'Orientación, solicitud y seguimiento de soportes para la certificación de discapacidad.',
 category:'certificacion',channel:'Secretaría de Salud',standard:true});

function catId_(value){
 if(typeof value!=='string'||!CATALOG_ID_.test(value)||['constructor','prototype','hasownproperty'].includes(value.toLowerCase()))throw Error('invalid_request');
 return value;
}
function catList_(value,max,map){
 if(!Array.isArray(value)||value.length>max)throw Error('invalid_request');
 return value.map(map);
}
function catUnique_(items){
 if(new Set(items).size!==items.length)throw Error('invalid_request');
 return items;
}
function catUid_(uid){
 if(typeof uid!=='string'||!CATALOG_USER_.test(uid))throw Error('invalid_request');
 return uid;
}
function catSchema_(d){
 if(!d||typeof d!=='object'||Array.isArray(d))throw Error('invalid_request');
 const fields=catList_(d.fields,16,f=>{
  const id=catId_(f?.id),type=instEnum_(f.type,CATALOG_TYPES_);
  const field={id,type,label:instText_(f.label,120),required:f.required===true};
  if(type==='select'||type==='radio'){
   field.options=catUnique_(catList_(f.options,10,x=>instText_(x,50)));
   if(!field.options.length)throw Error('invalid_request');
  }else if(type==='document'){
   field.fixture=instEnum_(f.fixture,['historia','apoyo']);
  }else if(type==='number'){
   if(!Number.isSafeInteger(f.fixture)||Math.abs(f.fixture)>100000000)throw Error('invalid_request');
   field.fixture=f.fixture;
  }else if(type==='date'){
   if(typeof f.fixture!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(f.fixture))throw Error('invalid_request');
   const date=new Date(f.fixture+'T00:00:00Z');
   if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==f.fixture)throw Error('invalid_request');
   field.fixture=f.fixture;
  }else if(type==='text'||type==='textarea')field.fixture=instText_(f.fixture,350);
  if(f.condition)field.condition={field:catId_(f.condition.field),equals:instText_(f.condition.equals,50)};
  return field;
 });
 catUnique_(fields.map(f=>f.id));
 catUnique_(fields.filter(f=>f.type==='document').map(f=>f.fixture));
 fields.forEach((field,i)=>{
  if(!field.condition)return;
  const other=fields.slice(0,i).find(x=>x.id===field.condition.field);
  if(!other?.options?.includes(field.condition.equals))throw Error('invalid_request');
 });
 const states=catList_(d.states,10,s=>({id:catId_(s?.id),label:instText_(s.label,80),next:catUnique_(catList_(s.next,6,catId_))}));
 const ids=catUnique_(states.map(s=>s.id));
 if(ids[0]!=='received'||!ids.includes('closed'))throw Error('invalid_request');
 states.forEach((state,i)=>{
  if(state.id==='closed'?state.next.length!==0:state.next.length===0||state.next.some(n=>!ids.slice(i+1).includes(n)))throw Error('invalid_request');
 });
 const reachable=new Set(['received']);
 for(const state of states)if(reachable.has(state.id))state.next.forEach(next=>reachable.add(next));
 if(reachable.size!==states.length)throw Error('invalid_request');
 return {title:instText_(d.title,120),description:instText_(d.description,1800),category:catId_(d.category),
  channel:instText_(d.channel,180),fields,states,operators:catUnique_(catList_(d.operators||[],40,catUid_)),
  messages:Object.fromEntries(['ack','correction','closure'].filter(key=>!!d.messages?.[key]).map(key=>[key,instText_(d.messages[key],500)]))};
}
function catStore_(){
 const {doc,data}=instRead_('catalog','registry');
 return {doc,categories:data?.categories||[],services:data?.services||[]};
}
function catSummary_(view){
 return {id:view.id,version:view.version,title:view.title,description:view.description,category:view.category,channel:view.channel,standard:!!view.standard};
}
function catPublic_(){
 const {categories,services}=catStore_();
 return {items:[CATALOG_BASE_,...services.filter(x=>x.live).map(x=>catSummary_({id:x.id,...x.live}))],
  categories:[{id:'certificacion',title:'Certificación'},...categories.filter(x=>x.active).map(({id,title})=>({id,title}))]};
}
function catService_(id){
 const entry=catStore_().services.find(x=>x.id===catId_(id));
 if(!entry?.live)throw Error('not_found');
 return entry;
}
function catChange_(u,action,d){
 instManager_(u);instRecent_(u);
 if(['servicePublish','serviceRetire','categoryRetire'].includes(action)&&u.role!=='supervisor')throw Error('forbidden');
 const id=catId_(d.id),store=catStore_();
 if(['discapacidad','certificacion'].includes(id))throw Error('invalid_request');
 const {doc,categories,services}=store;
 let next;
 if(action==='categorySave'||action==='categoryRetire'){
  const index=categories.findIndex(x=>x.id===id);
  const old=categories[index];
  if(action==='categoryRetire'&&(!old||services.some(x=>x.live?.category===id)))throw Error('invalid_transition');
  if(!old&&categories.length>=20)throw Error('rate_limit');
  next={id,title:action==='categorySave'?instText_(d.title,70):old.title,active:action==='categorySave'};
  if(index<0)categories.push(next);else categories[index]=next;
 }else{
  const index=services.findIndex(x=>x.id===id),old=services[index];
  if((old?.revision||0)!==d.revision)throw Error('content_version_changed');
  const revision=(old?.revision||0)+1;
  if(action==='serviceSave'||action==='serviceDuplicate'){
   if(!old&&services.length>=15)throw Error('rate_limit');
   const source=action==='serviceDuplicate'?services.find(x=>x.id===d.sourceId)?.draft:null;
   const draft=catSchema_(source?{...source,title:d.title}:d.schema);
   if(!categories.some(x=>x.id===draft.category&&x.active))throw Error('invalid_request');
   next={id,revision,state:'draft',draft,live:old?.live||null};
  }else{
   if(!old)throw Error('not_found');
   if(action==='servicePublish'){
    if(old.state!=='draft'||!categories.some(x=>x.id===old.draft.category&&x.active))throw Error('invalid_transition');
    const reference=instText_(d.reference,180);
    const idVersion=id+'-'+revision;
    const live={...old.draft,version:revision,idVersion,reference,hash:spHash_(JSON.stringify(old.draft))};
    next={...old,revision,state:'published',live};
   }else if(old.live)next={...old,revision,state:'withdrawn',live:null};
   else throw Error('invalid_transition');
  }
  if(index<0)services.push(next);else services[index]=next;
 }
 if(JSON.stringify({categories,services}).length>180000)throw Error('rate_limit');
 spLimit_(u,'catalogWrite',50);
 const writes=[spPut_('catalog','registry',{categories,services},doc,['updatedAt']),instLog_('catalog-'+id,u,next)];
 if(action==='servicePublish')writes.push(spPut_('serviceVersions',next.live.idVersion,{serviceId:id,schema:next.live,publishedBy:u.uid},null,['at']));
 spCommit_(writes);
 if(typeof CacheService!=='undefined')CacheService.getScriptCache().remove('catalog-public-v1');
 return next;
}
function catAnswer_(values,fields){
 if(!values||typeof values!=='object'||Array.isArray(values))throw Error('invalid_request');
 const answers={},files=[],allowed=new Set();
 for(const field of fields){
  if(field.condition&&answers[field.condition.field]!==field.condition.equals)continue;
  allowed.add(field.id);
  const val=Object.prototype.hasOwnProperty.call(values,field.id)?values[field.id]:null;
  if(val===null||val===''){
   if(field.required)throw Error('invalid_request');
   continue;
  }
  if(field.type==='document')files.push({field:field.id,fixture:spFixture_(val,field.fixture)});
  else if(field.options?.includes(val)||(field.type==='checkbox'&&typeof val==='boolean')){
   if(field.type==='checkbox'&&field.required&&val!==true)throw Error('invalid_request');
   answers[field.id]=val;
  }else if((['text','textarea','number','date'].includes(field.type))&&val===field.fixture)answers[field.id]=val;
  else throw Error('invalid_profile');
 }
 if(Object.keys(values).some(k=>!allowed.has(k)))throw Error('invalid_request');
 return {answers,files};
}
function catCaseView_(doc,staff=false){
 const row=spData_(doc.fields);
 const {id,serviceId,serviceVersion,title,radicado,status,revision,createdAt,updatedAt,assignedTo,ackStatus,deliveryStatus}=row;
 const result={id,serviceId,serviceVersion,title,radicado,status,revision,createdAt,updatedAt,ackStatus,deliveryStatus};
 result.files=(row.files||[]).map(({field,kind,size})=>({field,kind,size}));
 result.correction=row.correction?{field:row.correction.field,kind:row.correction.kind,label:row.correction.label}:null;
 if(staff)Object.assign(result,{assignedTo,answers:row.answers,ownerUid:row.ownerUid,notes:row.notes||[]});
 return result;
}
function catScope_(u,row){
 return ['admin','supervisor'].includes(u.role)||(u.role==='operator'&&row.operators.includes(u.uid)&&(!row.assignedTo||row.assignedTo===u.uid));
}
function catApply_(u,d){
 if(d.synthetic!==true||!CATALOG_KEY_.test(d.key||''))throw Error('invalid_request');
 const id=spHash_(u.uid+':service:'+catId_(d.id)+':'+d.key);
 const prior=spRead_('serviceRequests',id);
 if(prior)return catCaseView_(prior);
 const store=catStore_(),service=store.services.find(x=>x.id===d.id);
 const live=service?.live;
 if(!live)throw Error('not_found');
 if(d.version!==live.version)throw Error('content_version_changed');
 const {answers,files}=catAnswer_(d.answers,live.fields);
 const evidence=instEvidence_(u,id,d.legalDecisions,d.id);
 spLimit_(u,'serviceApply',5);
 const radicado='SP-PIL-'+id.slice(0,16).toUpperCase();
 const row={id,serviceId:d.id,serviceVersion:live.version,versionId:live.idVersion,title:live.title,radicado,ownerUid:u.uid,
  email:u.email,status:files.length?'saving':'received',revision:1,answers,files:[],notes:[],assignedTo:null,
  operators:live.operators,messages:live.messages||{},notifyByEmail:evidence.notify,ackStatus:'pending',deliveryStatus:'not_sent',correctionStatus:'not_sent'};
 const guard={verify:spName_('catalog','registry'),currentDocument:{updateTime:store.doc.updateTime}};
 spCommit_([guard,...evidence.writes,spPut_('serviceRequests',id,row,null,['createdAt','updatedAt']),spAudit_(id,u.uid,'service:created')]);
 if(files.length){
  let stored;
  try{
   const folder=folder_(root_(),id);
   stored=files.map(x=>({field:x.field,...savePdf_(folder,x.fixture)}));
  }catch(_){}
  const current=spRead_('serviceRequests',id);
  const update=stored?{files:stored,status:'received'}:{status:'storage_review'};
  spCommit_([spPut_('serviceRequests',id,update,current,['updatedAt']),spAudit_(id,u.uid,'service:'+update.status)]);
 }
 const current=spRead_('serviceRequests',id);
 if(spData_(current.fields).status==='received')catNotify_(current,u,'ack');
 return catCaseView_(spRead_('serviceRequests',id));
}
function catNotify_(doc,u,phase){
 const row=spData_(doc.fields),field=phase==='ack'?'ackStatus':phase==='correction'?'correctionStatus':'deliveryStatus';
 const marker=phase==='correction'?row.correction?.id:null;
 if(phase==='correction'&&!marker)return;
 if(!row.notifyByEmail){
  if(row[field]!=='declined')spCommit_([spPut_('serviceRequests',row.id,{[field]:'declined'},doc,['updatedAt'])]);
  return;
 }
 if(!isValidEmail_(row.email)||MailApp.getRemainingDailyQuota()<1||['sent','sending','review'].includes(row[field]))return;
 const folder=folder_(root_(),row.id);
 spCommit_([spPut_('serviceRequests',row.id,{[field]:'sending'},doc,['updatedAt']),spAudit_(row.id,u.uid,'service-mail:sending')]);
 let sent=false;
 try{
  const body=row.messages?.[phase]||'Hay una actualización de su solicitud de prueba.';
  sent=spJournal_(folder,'service-'+phase+(marker?'-'+marker:'')+'.json',()=>spMail_(row.email,'Actualización de solicitud de prueba',
   body+' Consulte la referencia de prueba '+row.radicado+' desde su cuenta verificada.'),1);
 }catch(_){}
 const current=spRead_('serviceRequests',row.id);
 if(marker&&spData_(current.fields).correction?.id!==marker)return;
 spCommit_([spPut_('serviceRequests',row.id,{[field]:sent?'sent':'review'},current,['updatedAt']),
  spAudit_(row.id,u.uid,sent?'service-mail:sent':'service-mail:review')]);
}
function catCaseAction_(u,action,d){
 if(!/^[a-f0-9]{64}$/.test(d.id||''))throw Error('invalid_request');
 const {doc,data:row}=instRead_('serviceRequests',d.id);
 if(!row)throw Error('not_found');
 const owner=row.ownerUid===u.uid,staff=catScope_(u,row);
 if(!owner&&!staff)throw Error('not_found');
 if(action==='serviceCase'){
  const schema=instRead_('serviceVersions',row.versionId).data?.schema;
  const current=schema?.states.find(x=>x.id===row.status);
  const actions=staff&&!row.correction?(current?.next.filter(x=>x!=='closed'||u.role==='supervisor')||[]):[];
  const history=spQuery_('audit','requestId',row.id,'at',40).map(x=>spData_(x.fields));
  return {...catCaseView_(doc,staff),next:actions,
   correctionOptions:staff&&!row.correction&&!['closed','saving','storage_review'].includes(row.status)?(schema?.fields.filter(x=>x.type==='document').map(({id,label})=>({id,label}))||[]):[],
   correctionStatus:staff?row.correctionStatus:null,
   stateLabels:Object.fromEntries((schema?.states||[]).map(x=>[x.id,x.label])),
   history:history.filter(item=>staff||/^service:(created|received|closed|correction_requested|correction_received)$/.test(item.action)).map(item=>({at:item.at,action:item.action,...(staff?{actorUid:item.actorUid}:{})}))};
 }
 if(action==='serviceDownload'){
  const file=(row.files||[]).find(x=>x.field===d.field);
  if(!file||(!staff&&!owner))throw Error('not_found');
  spLimit_(u,'serviceDownload',80);
  spCommit_([spAudit_(row.id,u.uid,'service-file:download')]);
  return spDownload_(row.id,file,file.kind);
 }
 if(action==='serviceSubmitCorrection'){
  if(!owner)throw Error('not_found');
  if(d.revision!==row.revision||!row.correction)throw Error('content_version_changed');
  const file=spFixture_(d.file,row.correction.kind);
  spLimit_(u,'serviceCorrectionSubmit',10);
  const saved=savePdf_(folder_(root_(),row.id),file);
  const files=(row.files||[]).filter(x=>x.field!==row.correction.field);
  files.push({field:row.correction.field,...saved});
  spCommit_([spPut_('serviceRequests',row.id,{files,correction:null,revision:row.revision+1},doc,['updatedAt']),spAudit_(row.id,u.uid,'service:correction_received')]);
  return catCaseView_(spRead_('serviceRequests',row.id));
 }
 if(!staff)throw Error('forbidden');
 if(d.revision!==row.revision)throw Error('content_version_changed');
 if(action==='serviceRetryMail'){
  instManager_(u);instRecent_(u);
  const phase=instEnum_(d.phase,['ack','correction','closure']),field=phase==='ack'?'ackStatus':phase==='correction'?'correctionStatus':'deliveryStatus';
  if(row[field]!=='pending'||(phase==='closure'&&row.status!=='closed')||(phase==='ack'&&['saving','storage_review'].includes(row.status)))throw Error('invalid_transition');
  spLimit_(u,'serviceRetryMail',20);catNotify_(doc,u,phase);
  return catCaseView_(spRead_('serviceRequests',row.id),true);
 }
 let update,event;
 if(action==='serviceRequestCorrection'){
  if(row.correction||['closed','saving','storage_review'].includes(row.status))throw Error('invalid_transition');
  const schema=instRead_('serviceVersions',row.versionId).data?.schema;
  const field=schema?.fields.find(x=>x.id===d.field&&x.type==='document');
  if(!field)throw Error('invalid_request');
  update={correction:{id:Utilities.getUuid(),field:field.id,kind:field.fixture,label:field.label},correctionStatus:'pending'};event='correction_requested';
 }else if(action==='serviceAssign'){
  instManager_(u);instRecent_(u);
  const id=catUid_(d.uid);
  if(!row.operators.includes(id)||sparkDoc_('admins',id)?.active!==true)throw Error('forbidden');
  update={assignedTo:id};event='assigned';
 }else if(action==='serviceNote'){
  const notes=row.notes||[];
  if(notes.length>=30)throw Error('rate_limit');
  update={notes:[...notes,{text:instText_(d.text,600),actorUid:u.uid,at:Date.now()}]};event='note';
 }else{
  const schema=instRead_('serviceVersions',row.versionId).data?.schema;
  const state=schema?.states.find(x=>x.id===row.status);
  if(row.correction||!state?.next.includes(d.status))throw Error('invalid_transition');
  if(d.status==='closed'){
   if(u.role!=='supervisor')throw Error('forbidden');
   instRecent_(u);
  }
  update={status:d.status};event=d.status;
  if(d.status==='closed')update.deliveryStatus='pending';
 }
 spLimit_(u,'serviceWrite',50);
 spCommit_([spPut_('serviceRequests',row.id,{...update,revision:row.revision+1},doc,['updatedAt']),spAudit_(row.id,u.uid,'service:'+event)]);
 if(update.status==='closed')catNotify_(spRead_('serviceRequests',row.id),u,'closure');
 if(event==='correction_requested')catNotify_(spRead_('serviceRequests',row.id),u,'correction');
 return catCaseView_(spRead_('serviceRequests',row.id),true);
}
function catStaff_(u,action,d){
 if(u.role!=='supervisor')throw Error('forbidden');
 instRecent_(u);
 if(action==='staffList'){
  spLimit_(u,'staffList',60);
  return {items:spQuery_('admins',null,null,'__name__',50).map(x=>{
   const value=spData_(x.fields);
   return {uid:x.name.split('/').pop(),email:value.email,role:value.role,active:value.active===true};
  })};
 }
 const uid=catUid_(d.uid);
 if(uid===u.uid)throw Error('forbidden');
 const role=instEnum_(d.role,['operator','admin','supervisor']);
 const email=instText_(d.email,254);
 if(!/@sanpedro-valle\.gov\.co$/i.test(email)||!isValidEmail_(email)||typeof d.active!=='boolean')throw Error('invalid_request');
 if(sparkDoc_('users',uid)?.active!==true)throw Error('not_enabled');
 const {doc}=instRead_('admins',uid);
 if(role==='supervisor'||(doc&&spData_(doc.fields).role==='supervisor'))throw Error('forbidden');
 spLimit_(u,'staffWrite',20);
 spCommit_([spPut_('admins',uid,{email,role,active:d.active},doc,['updatedAt']),spAudit_(uid,u.uid,'staff:change')]);
 return {uid,email,role,active:d.active};
}
function catCases_(u,d,staff){
 if(staff)spRequireAdmin_(u);
 const ownerField=!staff?'ownerUid':u.role==='operator'?'operators':null;
 const accessible=row=>staff?catScope_(u,row):row.ownerUid===u.uid;
 let cursor;
 if(d.after){
  if(!/^[a-f0-9]{64}$/.test(d.after))throw Error('invalid_request');
  cursor=spRead_('serviceRequests',d.after);
  const row=cursor?spData_(cursor.fields):null;
  if(!row||!accessible(row))throw Error('not_found');
 }
 const docs=spQuery_('serviceRequests',ownerField,u.uid,'createdAt',50,{cursor,op:ownerField==='operators'?'ARRAY_CONTAINS':'EQUAL'});
 const items=docs.filter(doc=>accessible(spData_(doc.fields))).map(x=>catCaseView_(x,staff));
 return {items,next:docs.length===50?items.at(-1)?.id||null:null};
}
function catDispatch_(u,action,d){
 if(action==='catalogList')return catPublic_();
 if(action==='serviceRead'){
  if(d.id===CATALOG_BASE_.id)return CATALOG_BASE_;
  const {live}=catService_(d.id);
  return {...catSummary_({id:d.id,...live}),fields:live.fields};
 }
 if(action==='catalogAdmin'){
  instManager_(u);
  spLimit_(u,'catalogAdmin',80);
  const {categories,services}=catStore_();
  return {categories,services,canPublish:u.role==='supervisor'};
 }
 if(action==='serviceHistory'){
  instManager_(u);spLimit_(u,'serviceHistory',60);
  return {items:spQuery_('institutionalVersions','entity','catalog-'+catId_(d.id),'at',30).map(x=>{
   const row=spData_(x.fields);return {at:row.at,actorUid:row.actorUid,revision:row.snapshot.revision,state:row.snapshot.state};
  })};
 }
 if(['categorySave','categoryRetire','serviceSave','serviceDuplicate','servicePublish','serviceRetire'].includes(action))return catChange_(u,action,d);
 if(action==='serviceApply')return catApply_(u,d);
 if(action==='serviceMine'||action==='serviceInbox'){
  spLimit_(u,'serviceList',80);
  return catCases_(u,d,action==='serviceInbox');
 }
 if(action==='serviceExport'){
  spRequireAdmin_(u);spLimit_(u,'serviceExport',15);
  const {items}=catCases_(u,d,true),counts=new Map();
  for(const {serviceId,status} of items){const key=serviceId+','+status;counts.set(key,(counts.get(key)||0)+1);}
  spCommit_([spAudit_('service-export',u.uid,'service:export')]);
  return {csv:'tramite,estado,expedientes\n'+Array.from(counts,([key,count])=>key+','+count).join('\n')};
 }
 if(action==='staffList'||action==='staffSave')return catStaff_(u,action,d);
 return catCaseAction_(u,action,d);
}
