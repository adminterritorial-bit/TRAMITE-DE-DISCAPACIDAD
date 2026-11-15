// Staged Spark authorization helpers. Not exposed by doPost until migration is tested.
const SPARK_PROJECT_ = 'tramite-discapacidad';
const SPARK_APP_ = '1:91732599743:web:1bb34f5a1cb708b673770a';
const SPARK_NUMBER_ = '91732599743';
function sparkJson_(url, options) {
  const response = UrlFetchApp.fetch(url, Object.assign({muteHttpExceptions:true}, options));
  if (response.getResponseCode() !== 200) throw Error('authorization_failed');
  return JSON.parse(response.getContentText());
}
function sparkClaims_(token) {
  if (typeof token !== 'string' || token.length > 16000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw Error('invalid_token');
  return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(token.split('.')[1])).getDataAsString());
}
function sparkDoc_(collection, uid) {
  if (!['users','admins'].includes(collection) || typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw Error('invalid_identity');
  const url = 'https://firestore.googleapis.com/v1/projects/'+SPARK_PROJECT_+'/databases/(default)/documents/'+collection+'/'+encodeURIComponent(uid);
  const r = UrlFetchApp.fetch(url,{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
  if (r.getResponseCode() === 404) return null;
  if (r.getResponseCode() !== 200) throw Error('authorization_failed');
  const f = JSON.parse(r.getContentText()).fields || {};
  return {active:f.active?.booleanValue === true,role:f.role?.stringValue,email:f.email?.stringValue};
}
function sparkVerifyApp_(token) {
  // Official API verifies signature and consumes the limited-use token.
  const p=sparkClaims_(token);
  const result=sparkJson_('https://firebaseappcheck.googleapis.com/v1beta/projects/'+SPARK_NUMBER_+':verifyAppCheckToken',{
    method:'post',contentType:'application/json',
    headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
    payload:JSON.stringify({appCheckToken:token})
  });
  if (result.alreadyConsumed === true || p.sub !== SPARK_APP_ || !Array.isArray(p.aud) || p.aud.indexOf('projects/'+SPARK_NUMBER_)<0 || p.iss !== 'https://firebaseappcheck.googleapis.com/'+SPARK_NUMBER_ || !Number.isFinite(p.exp) || p.exp <= Date.now()/1000) throw Error('invalid_app');
}
function sparkIdentity_(idToken, adminRequired) {
  const p=sparkClaims_(idToken);
  // Do not trust decoded claims without successful lookup using the same signed token.
  const answer=sparkJson_('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(prop_('FIREBASE_WEB_API_KEY')),{
    method:'post',contentType:'application/json',payload:JSON.stringify({idToken:idToken})
  });
  const u=answer.users?.[0],now=Math.floor(Date.now()/1000);
  if (!u || answer.users.length!==1 || p.aud!==SPARK_PROJECT_ || p.iss!=='https://securetoken.google.com/'+SPARK_PROJECT_ || !p.sub || u.localId!==p.sub || p.email_verified!==true || u.emailVerified!==true || u.disabled===true || !u.email || p.email!==u.email || !Number.isFinite(p.exp) || p.exp<=now || !Number.isFinite(p.auth_time) || p.auth_time>now || !Number.isFinite(p.iat) || p.iat>now || (u.validSince && (!Number.isFinite(Number(u.validSince)) || p.auth_time<Number(u.validSince)))) throw Error('invalid_identity');
  if (sparkDoc_('users',u.localId)?.active!==true) throw Error('not_enabled');
  const a=sparkDoc_('admins',u.localId);
  const role=p.firebase?.sign_in_provider==='google.com' && u.email.toLowerCase().endsWith('@sanpedro-valle.gov.co') && a?.active===true && a.email===u.email && ['operator','admin','supervisor'].includes(a.role)?a.role:null;
  if(adminRequired&&!role)throw Error('forbidden');
  return {uid:u.localId,email:u.email,role:role,authTime:p.auth_time};
}
// Test the privileged App Check verification path without consuming a genuine token.
function testSparkAppCheck() {
  const r=UrlFetchApp.fetch('https://firebaseappcheck.googleapis.com/v1beta/projects/'+SPARK_NUMBER_+':verifyAppCheckToken',{
    method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},
    payload:JSON.stringify({appCheckToken:'invalid-probe'}),muteHttpExceptions:true
  });
  let diagnostic={};try{const e=JSON.parse(r.getContentText()).error||{};diagnostic={status:e.status||'',message:String(e.message||'').slice(0,300),reasons:(e.details||[]).map(x=>x.reason).filter(Boolean)};}catch(_){}
  console.log('App Check probe HTTP '+r.getResponseCode()+' '+JSON.stringify(diagnostic));
  if(r.getResponseCode()===200)throw Error('invalid token unexpectedly accepted');
}
