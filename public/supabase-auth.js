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

// Google OAuth through Supabase, using the publishable key only.
export async function createSupabaseController(settings,{onUser}){
 if(!settings?.url||!settings?.publishableKey)throw Error('Configuración de autenticación incompleta.');
 const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm');
 const client=createClient(settings.url,settings.publishableKey,{
  auth:{flowType:'pkce',autoRefreshToken:true,persistSession:true,
   detectSessionInUrl:true,storage:window.sessionStorage}
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
 return {
  async login(institutional=false){
   sessionStorage.setItem('sits-login-destination',institutional?'admin':'citizen');
   const {error}=await client.auth.signInWithOAuth({
    provider:'google',options:{
     redirectTo:location.origin+'/',
     queryParams:{prompt:'select_account',
      ...(institutional?{hd:'sanpedro-valle.gov.co'}:{})}
    }
   });
   if(error)throw Error('Google no permitió iniciar sesión: '+error.message);
  },
  async logout(){
   const {error}=await client.auth.signOut();
   if(error)throw Error('No se pudo cerrar la sesión.');
  }
 };
}
