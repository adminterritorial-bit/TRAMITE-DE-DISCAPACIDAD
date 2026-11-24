// Only allow known diagnostics out of the OAuth callback. The description can
// contain Google's authorization code and must never be rendered or logged.
export function consumeGoogleOAuthFailure(){
 const url=new URL(location.href);
 const fragment=new URLSearchParams(url.hash.slice(1));
 const queryFailed=url.searchParams.has('error')||url.searchParams.has('error_code');
 const fragmentFailed=fragment.has('error')||fragment.has('error_code');
 if(!queryFailed&&!fragmentFailed)return null;
 const params=queryFailed?url.searchParams:fragment;
 const knownCodes=['unexpected_failure','access_denied','bad_oauth_callback','bad_oauth_state',
  'flow_state_expired','flow_state_not_found','oauth_provider_not_supported'];
 const reportedCode=params.get('error_code')||params.get('error');
 const code=knownCodes.includes(reportedCode)?reportedCode:'oauth_callback_failed';
 const failedExchange=(params.get('error_description')||'').startsWith('Unable to exchange external code');
 const reason=failedExchange?'provider_code_exchange_failed':code;
 for(const key of ['error','error_code','error_description','code']){
  url.searchParams.delete(key);
  if(fragmentFailed)fragment.delete(key);
 }
 if(fragmentFailed)url.hash=fragment.toString();
 history.replaceState(history.state,'',url);
 return {
  code,reason,
  message:failedExchange
   ?'Google devolvió la autorización, pero Supabase no pudo completar el ingreso.'
   :'No se pudo completar el ingreso con Google.'
 };
}

const GOOGLE_IDENTITY_SCRIPT='https://accounts.google.com/gsi/client';
let identityLoader;
function loadGoogleIdentity(){
 if(window.google?.accounts?.id)return Promise.resolve(window.google.accounts.id);
 if(!identityLoader)identityLoader=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=GOOGLE_IDENTITY_SCRIPT;
  script.async=true;
  const fail=()=>{
   clearTimeout(timeout);
   script.remove();
   identityLoader=null;
   reject(Error('google_script_unavailable'));
  };
  const timeout=setTimeout(fail,12000);
  script.onload=()=>{
   clearTimeout(timeout);
   const identity=window.google?.accounts?.id;
   if(identity)resolve(identity);else fail();
  };
  script.onerror=fail;
  document.head.append(script);
 });
 return identityLoader;
}

async function googleNonce(){
 const raw=crypto.randomUUID();
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
 const hashed=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 return {raw,hashed};
}

// Supabase validates a signed Google identity token using the configured audience.
export async function createSupabaseController(settings,{onUser,onAuthError}){
 if(!settings?.url||!settings?.publishableKey||!settings?.googleClientId)throw Error('Configuración de autenticación incompleta.');
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm');
 const client=createClient(settings.url,settings.publishableKey,{
  auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false,storage:window.sessionStorage}
 });
 let previousId;
 function adapted(session){
  if(!session?.user)return null;
  const u=session.user;
  return {uid:u.id,email:u.email,emailVerified:!!u.email_confirmed_at,
   async getIdToken(){
    const {data,error}=await client.auth.getSession();
    if(error||!data.session?.access_token)throw Error('La sesión expiró. Ingresa nuevamente.');
    return data.session.access_token;
   }};
 }
 client.auth.onAuthStateChange((event,session)=>{
  if(event==='TOKEN_REFRESHED')return;
  const id=session?.user?.id||null;
  if(event==='SIGNED_IN'&&previousId===id)return;
  previousId=id;
  queueMicrotask(()=>{void onUser(adapted(session));});
 });
 const dialog=document.createElement('dialog');
 dialog.className='institution-dialog';
 const title=document.createElement('h2');
 title.id='googleIdentityTitle';
 title.textContent='Ingresa con Google';
 dialog.setAttribute('aria-labelledby',title.id);
 const message=document.createElement('p');
 message.setAttribute('role','status');
 const mount=document.createElement('div');
 const close=document.createElement('button');
 close.type='button';
 close.className='secondary';
 close.textContent='Cerrar';
 close.addEventListener('click',()=>dialog.close());
 dialog.append(title,message,mount,close);
 document.body.append(dialog);
 let attempt;
 dialog.addEventListener('close',()=>{if(!dialog.open){attempt=null;mount.replaceChildren();}});
 return {
  async login(institutional=false){
   if(dialog.open)return;
   const current={};
   attempt=current;
   message.textContent='Cargando el acceso de Google…';
   mount.replaceChildren();
   dialog.showModal();
   try{
    const [identity,nonce]=await Promise.all([loadGoogleIdentity(),googleNonce()]);
    if(attempt!==current||!dialog.open)return;
    identity.initialize({
     client_id:settings.googleClientId,nonce:nonce.hashed,auto_select:false,button_auto_select:false,ux_mode:'popup',
     ...(institutional?{hd:'sanpedro-valle.gov.co'}:{}),
     callback:async ({credential})=>{
      if(attempt!==current||!dialog.open||current.used||!credential)return;
      current.used=true;
      mount.replaceChildren();
      close.disabled=true;
      message.textContent='Verificando tu cuenta en Supabase…';
      sessionStorage.setItem('sits-login-destination',institutional?'admin':'citizen');
      try{
       const {error}=await client.auth.signInWithIdToken({provider:'google',token:credential,nonce:nonce.raw});
       if(error)throw error;
       if(dialog.open)dialog.close();
      }catch(_){
       sessionStorage.removeItem('sits-login-destination');
       message.textContent='Supabase no pudo validar tu cuenta. Cierra esta ventana e intenta nuevamente.';
       onAuthError?.('identity_token','google_identity_rejected');
      }finally{close.disabled=false;}
     }
    });
    message.textContent=institutional?'Elige tu cuenta institucional.':'Elige tu cuenta de Google.';
    identity.renderButton(mount,{type:'standard',theme:'outline',size:'large',text:'signin_with'});
   }catch(err){
    if(attempt!==current||!dialog.open)return;
    message.textContent='No se pudo cargar el ingreso de Google. Cierra esta ventana e intenta nuevamente.';
    onAuthError?.('start',err.message==='google_script_unavailable'?'google_script_unavailable':'google_start_failed');
   }
  },
  async logout(){
   window.google?.accounts?.id?.disableAutoSelect();
   const {error}=await client.auth.signOut();
   if(error)throw Error('No se pudo cerrar la sesión.');
  }
 };
}
