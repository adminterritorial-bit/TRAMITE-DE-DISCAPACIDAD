import { createClient } from "npm:@supabase/supabase-js@2.84.0";
const ORIGINS = new Set(["https://sits-salud-san-pedro.vercel.app", "https://adminterritorial-bit.github.io"]);
const MAX = 4718592;
const url = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!url || !anonKey || !secret) throw new Error("backend_credentials_missing");
const admin = createClient(url, secret, {auth:{autoRefreshToken:false,persistSession:false}});
const authClient = createClient(url, anonKey, {auth:{autoRefreshToken:false,persistSession:false}});
class ApiError extends Error { constructor(code,status=400){super(code);this.status=status;} }
const requireIt=(ok,code="invalid_request")=>{if(!ok)throw new ApiError(code)};
const text=(s,max=120)=>{requireIt(typeof s==="string"&&s.trim().length>0&&s.trim().length<=max);return s.trim()};
const optional=(s,max=300)=>typeof s==="string"?s.trim().slice(0,max):"";
const stamp=(s)=>s?new Date(s).getTime():null;
const db=async(q)=>{const {data,error}=await q;if(error){console.error("db_error",error.code,error.message);throw new ApiError(error.code==="23505"?"conflict":"database_unavailable",409)}return data};
const one=async(q)=>{const v=await db(q);if(!v)throw new ApiError("not_found",404);return v};
const staffFor=async(user)=>{const {data,error}=await admin.from("sits_staff_members").select("role,active,institutional_email").eq("user_id",user.id).maybeSingle();
 if(error)throw new ApiError("database_unavailable",503);
 if(!data?.active||data.institutional_email!==user.email?.toLowerCase()||!user.email?.toLowerCase().endsWith("@sanpedro-valle.gov.co"))return null;
 return data.role};
const caseRow=async(id)=>one(admin.from("sits_cases").select("*").eq("id",id).single());
const accessible=(row,user,role)=>{requireIt(row.owner_user_id===user.id||role==="admin"||role==="supervisor", "forbidden")};
const permittedStaff=(role)=>requireIt(role==="admin"||role==="supervisor","forbidden");
const sha=async(bytes)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(b=>b.toString(16).padStart(2,"0")).join("");
function pdf(data,kind){requireIt(data&&data.kind===kind&&typeof data.base64==="string"&&data.base64.length<=6300000,"invalid_fixture");
 let raw;try{raw=Uint8Array.from(atob(data.base64),v=>v.charCodeAt(0))}catch{throw new ApiError("invalid_fixture")}
 requireIt(raw.length>=20&&raw.length<=MAX&&new TextDecoder().decode(raw.slice(0,5))==="%PDF-"&&raw.length===data.size,"invalid_fixture");
 return raw}
async function saveDoc(row,user,file,kind){const bytes=pdf(file,kind);requireIt(await sha(bytes)===file.sha,"invalid_fixture");
 const {data:existing}=await admin.from("sits_case_documents").select("version").eq("case_id",row.id).eq("kind",kind).order("version",{ascending:false}).limit(1);
 const version=(existing?.[0]?.version||0)+1;
 const path=`${row.id}/${kind}/${crypto.randomUUID()}.pdf`;
 await db(admin.storage.from("sits-salud-private").upload(path,bytes,{contentType:"application/pdf",upsert:false,cacheControl:"private"}));
 try {
  return await one(admin.from("sits_case_documents").insert({case_id:row.id,kind,version,storage_path:path,sha256:file.sha,bytes:bytes.length,filename:kind+".pdf",uploaded_by:user.id}).select("*").single());
 } catch(e) { await admin.storage.from("sits-salud-private").remove([path]); throw e; }
}
async function loadFiles(id){return await db(admin.from("sits_case_documents").select("id,kind,bytes,version,storage_path,sha256").eq("case_id",id).order("version",{ascending:false}))||[]}
async function view(row,isStaff=false){const [files,events]=await Promise.all([
 loadFiles(row.id),
 db(admin.from("sits_case_events").select("new_status,comment,created_at").eq("case_id",row.id).order("created_at",{ascending:true}).limit(30))
 ]);
 const kinds=new Set(),latest=[];
 for(const f of files){if(!kinds.has(f.kind)){kinds.add(f.kind);latest.push(f)}}
 const certificate=latest.find(f=>f.kind==="certificate");
 const common={id:row.id,reference:row.reference,status:row.status,createdAt:stamp(row.created_at),updatedAt:stamp(row.updated_at),revision:row.revision,
 files:latest.filter(f=>f.kind!=="certificate").map(f=>({kind:f.kind,size:f.bytes})),
 correctionKind:row.correction_kind,certificateAvailable:!!certificate&&["delivered","available","delivery_review","closed"].includes(row.status),
 deliveryMethod:row.delivery_method,
 history:[{status:"saving",at:stamp(row.created_at),comment:"Solicitud creada"},...(events||[]).map(e=>({status:e.new_status,at:stamp(e.created_at),comment:e.comment}))]};
 if(isStaff)Object.assign(common,{name:row.applicant_name,email:row.owner_email,documentType:row.document_type,documentNumber:row.document_number,phone:row.phone,zone:row.residence_zone,representation:row.representation,support:row.support_needed,
 certificateEmailConsent:row.certificate_email_consent,certificate:certificate?{kind:"certificate",size:certificate.bytes}:null,deliveryStatus:row.delivery_status});
 return common}
async function change(row,user,status,comment,extras={}) {
 const values={...extras,status,last_action:comment,updated_by:user.id,revision:row.revision+1};
 const modified=await db(admin.from("sits_cases").update(values).eq("id",row.id).eq("revision",row.revision).select("*").maybeSingle());
 if(!modified)throw new ApiError("content_version_changed",409);
 return modified
}
async function audit(user,id,event,details={}) {
 await db(admin.from("sits_audit_events").insert({actor_user_id:user.id,case_id:id,event_type:event,details}))
}
async function execute(action,d,user,role) {
 const uid=user.id;
 if(action==="sessionAccess")return {role:role||null,canManage:!!role,canDeliver:role==="supervisor",institutional:!!role,build:"sits-supabase-1.0"};
 if(action==="officialMine"){const rows=await db(admin.from("sits_cases").select("*").eq("owner_user_id",uid).order("created_at",{ascending:false}).limit(50));return {items:await Promise.all((rows||[]).map(r=>view(r,false)))}}
 if(action==="officialInbox"){permittedStaff(role);const rows=await db(admin.from("sits_cases").select("*").order("created_at",{ascending:false}).limit(100));return {items:await Promise.all((rows||[]).map(r=>view(r,true)))}}
 if(action==="officialSubmit"){
  requireIt(d.medicalConsent===true&&typeof d.key==="string"&&/^[a-f0-9-]{36}$/i.test(d.key)&&Array.isArray(d.files)&&d.files.length>=1&&d.files.length<=2);
  const key=d.key;const prior=await db(admin.from("sits_cases").select("*").eq("owner_user_id",uid).eq("idempotency_key",key).maybeSingle());
  if(prior)return view(prior);
  const name=text(d.name,120),docType=text(d.documentType,8),documentNumber=text(d.documentNumber,25).toUpperCase();
  requireIt(["CC","TI","RC","CE","PA","OTRO"].includes(docType)&&/^[A-Z0-9-]{3,25}$/.test(documentNumber));
  requireIt(["Cabecera municipal","Centro poblado","Zona rural dispersa"].includes(d.zone)&&["propia","apoyo"].includes(d.representation));
  const policies=await db(admin.from("sits_legal_documents").select("*").eq("active",true));
  requireIt(d.legalDecisions.length===policies.length,"legal_decision_required");
  for(const p of policies){const consent=d.legalDecisions.find(v=>v.id===p.id);requireIt(consent?.accepted===true&&consent.version===p.version&&consent.hash===p.content_hash,"legal_version_changed")}
  const kinds=d.files.map(x=>x.kind);requireIt(kinds.includes("historia")&&new Set(kinds).size===kinds.length&&kinds.every(k=>["historia","apoyo"].includes(k)));
  requireIt(d.files.reduce((n,f)=>n+Number(f.size||0),0)<=7340032,"invalid_fixture");
  const row=await one(admin.from("sits_cases").insert({
   reference:"SSP-"+crypto.randomUUID().replaceAll("-","").slice(0,20).toUpperCase(),
   owner_user_id:uid,owner_email:user.email,idempotency_key:key,service_id:"certificacion-discapacidad",
   applicant_name:name,document_type:docType,document_number:documentNumber,phone:optional(d.phone,25),
   residence_zone:d.zone,representation:d.representation,support_needed:optional(d.support,300),
   medical_consent:true,notify_by_email:d.notifyByEmail===true,certificate_email_consent:d.certificateEmailConsent===true,updated_by:uid
  }).select("*").single());
  await db(admin.from("sits_consent_evidence").insert(policies.map(p=>({case_id:row.id,owner_user_id:uid,document_id:p.id,version:p.version,document_hash:p.content_hash,accepted:true}))));
  await audit(user,row.id,"official:intake_started");
  try {
   for(const f of d.files)await saveDoc(row,user,f,f.kind);
   const updated=await change(row,user,"received","Soportes recibidos");
   return view(updated)
  } catch(e) {try{await change(row,user,"storage_review","Revisar documentos almacenados")}catch{ /* preserve error */ }throw e}
 }
 requireIt(typeof d.id==="string"&&/^[a-f0-9-]{36}$/i.test(d.id));
 let row=await caseRow(d.id);
 accessible(row,user,role);
 if(action==="officialRead")return view(row,row.owner_user_id!==uid);
 if(action==="officialDownload"){
  const kind=text(d.kind,24);requireIt(["historia","apoyo","certificate"].includes(kind));
  requireIt(kind!=="certificate"||row.owner_user_id!==uid||["delivered","available","delivery_review","closed"].includes(row.status),"forbidden");
  const files=await loadFiles(row.id);const f=files.find(v=>v.kind===kind);if(!f)throw new ApiError("not_found",404);
  const download=await db(admin.storage.from("sits-salud-private").download(f.storage_path));
  const buffer=new Uint8Array(await download.arrayBuffer());requireIt(await sha(buffer)===f.sha256,"invalid_fixture");
  let str="";for(let i=0;i<buffer.length;i+=32768)str+=String.fromCharCode(...buffer.subarray(i,i+32768));
  await audit(user,row.id,"official:download:"+kind);
  return {base64:btoa(str),kind}
 }
 if(action==="officialCorrect"){
  requireIt(row.owner_user_id===uid&&row.status==="needs_documents"&&row.revision===d.revision&&row.correction_kind===d.file?.kind,"invalid_transition");
  await saveDoc(row,user,d.file,d.file.kind);
  row=await change(row,user,"reviewing","Soporte corregido por el ciudadano",{correction_kind:null});
  return view(row)
 }
 permittedStaff(role);
 if(action==="officialTransition"){
  requireIt(row.revision===d.revision,"content_version_changed");
  const steps={received:["reviewing"],reviewing:["needs_documents","awaiting_certificate","not_proceed"],needs_documents:["reviewing"],awaiting_certificate:["reviewing","not_proceed"],delivered:["closed"],available:["closed"],not_proceed:["closed"]};
  requireIt(steps[row.status]?.includes(d.status),"invalid_transition");
  const comment=text(d.comment,450),kind=d.status==="needs_documents"?text(d.documentKind,24):null;
  requireIt(!kind||["historia","apoyo"].includes(kind));
  row=await change(row,user,d.status,comment,{correction_kind:kind});
  if(row.notify_by_email&&["needs_documents","awaiting_certificate","not_proceed"].includes(d.status)){
   await db(admin.from("sits_notifications").insert({case_id:row.id,recipient_user_id:row.owner_user_id,recipient_email:row.owner_email,kind:"status:"+d.status,state:"not_configured"}));
  }
  return view(row,true)
 }
 if(action==="officialSendCertificate"){
  requireIt(row.revision===d.revision&&row.status==="awaiting_certificate"&&d.confirm===true,"invalid_transition");
  await saveDoc(row,user,d.file,"certificate");
  row=await change(row,user,"sending","Certificado incorporado");
  // Delivery via email is NOT falsely marked as sent. Keep portal delivery until
  // an approved mail provider and auditable sender are configured.
  row=await change(row,user,"available","Certificado disponible en portal privado; correo no configurado",{delivery_method:"portal",delivery_status:"not_configured"});
  if(row.certificate_email_consent)await db(admin.from("sits_delivery_attempts").insert({case_id:row.id,method:"email",recipient_email:row.owner_email,status:"not_configured",requested_by:uid}));
  return view(row,true)
 }
 if(action==="officialVerifyDelivery")throw new ApiError("delivery_uncertain",409);
 throw new ApiError("invalid_request",404)
}
function response(data,origin,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","vary":"Origin","access-control-allow-origin":origin,"access-control-allow-headers":"authorization,apikey,content-type,x-client-info","access-control-allow-methods":"GET,POST,OPTIONS"}})}
Deno.serve(async(req)=>{
 const origin=req.headers.get("origin")||"";
 if(!ORIGINS.has(origin))return new Response("Forbidden",{status:403});
 if(req.method==="OPTIONS")return response({},origin);
 try {
  const requested=new URL(req.url);
  if(req.method==="GET"&&requested.searchParams.get("content")==="official-intake"){
   const docs=await db(admin.from("sits_legal_documents").select("*").eq("active",true).order("id"));
   return response({ok:true,enabled:false,documents:docs.map(x=>({id:x.id,title:x.title,body:x.body,kind:x.kind,version:x.version,hash:x.content_hash}))},origin)
  }
  if(req.method==="GET"&&requested.searchParams.get("content")==="catalog"){
   const services=await db(admin.from("sits_services").select("id,title,description,category_id").eq("active",true));
   return response({ok:true,services:services||[]},origin)
  }
  if(req.method==="GET")return response({ok:true,build:"sits-supabase-1.0",enabled:false},origin);
  if(req.method!=="POST")throw new ApiError("invalid_method",405);
  const bearer=req.headers.get("authorization")||"";
  requireIt(/^Bearer\s+\S+$/.test(bearer),"unauthorized");
  const {data:{user},error}=await authClient.auth.getUser(bearer.replace(/^Bearer\s+/i,""));
  if(error||!user||!user.email_confirmed_at||user.is_anonymous)throw new ApiError("unauthorized",401);
  const payload=await req.json();const action=payload?.action;requireIt(typeof action==="string"&&action.length<=64);
  const role=await staffFor(user);
  const value=await execute(action,payload?.data||{},user,role);
  return response({ok:true,build:"sits-supabase-1.0",data:value},origin);
 }catch(e){const status=e instanceof ApiError?e.status:500;console.error("sits_api_error",e instanceof Error?e.message:String(e));return response({ok:false,build:"sits-supabase-1.0",error:e instanceof ApiError?e.message:"internal_error"},origin,status)}
});
