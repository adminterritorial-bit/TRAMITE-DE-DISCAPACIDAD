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
