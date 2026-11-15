import {config} from './config.js';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,setPersistence,inMemoryPersistence,signOut} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {initializeAppCheck,ReCaptchaEnterpriseProvider,getLimitedUseToken} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app-check.js';
const $=id=>document.getElementById(id);
const status=$('status'),button=$('test');
const app=initializeApp(config.firebase,'spark-diagnostic');
const auth=getAuth(app);
const check=initializeAppCheck(app,{provider:new ReCaptchaEnterpriseProvider(config.appCheckSiteKey),isTokenAutoRefreshEnabled:false});
// Exact endpoint pinned by SHA-256, so an auth token cannot be sent to an arbitrary URL.
const expected='80ac944b3abbd5dc1e884c7911acfd6b4c75395c5da4e41bc2077a9908800612';
async function endpoint(){
 const raw=$('endpoint').value.trim();
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(raw))throw Error('URL incompleta.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
 const hex=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 if(hex!==expected)throw Error('La URL no corresponde a Recepción.');
 return raw;
}
try{
 await setPersistence(auth,inMemoryPersistence);
 button.disabled=false;status.textContent='Introduce la URL de Recepción e inicia sesión con Salud.';
}catch(_){status.textContent='No se pudo inicializar la autenticación.';}
button.onclick=async()=>{
 button.disabled=true;let stage='url';
 try{
  const target=await endpoint();
  stage='login';status.textContent='Inicia sesión con la cuenta institucional.';
  const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account',hd:'sanpedro-valle.gov.co'});
  const result=await signInWithPopup(auth,provider);
  if(result.user.email?.toLowerCase()!=='salud@sanpedro-valle.gov.co')throw Error('Selecciona la cuenta de Salud.');
  stage='token';status.textContent='Verificando App Check…';
  const idToken=await result.user.getIdToken(true);
  const token=(await getLimitedUseToken(check)).token;
  await signOut(auth);
  const form=$('send');form.action=target;form.elements.idToken.value=idToken;form.elements.appCheck.value=token;
  status.textContent='Enviando diagnóstico seguro…';
  // POST navigation: no credential in the URL; no cross-origin fetch preflight.
  form.submit();
 }catch(e){await signOut(auth).catch(()=>{});status.textContent='No se completó: '+stage+' ('+(e.code||'verifica la cuenta y la URL')+').';button.disabled=false;}
};
