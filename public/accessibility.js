// Public guidance only. No form values, expedientes, emails or documents are spoken.
const guidance=Object.freeze({
 catalog:'Bienvenido a SITS Salud de la Alcaldía de San Pedro. Usa el buscador para encontrar el servicio. Elige una categoría o una tarjeta para consultar sus requisitos. En Mis solicitudes puedes acceder al seguimiento con una cuenta autorizada.',
 service:'Consulta la información y los requisitos del servicio. Revisa el canal de atención y la disponibilidad de la radicación. Si necesitas ayuda, puedes acudir a los canales oficiales de la Alcaldía.',
 citizen:'Para acceder al formulario, identifica tu cuenta cuando se solicite. Revisa las instrucciones de cada paso. Puedes pedir apoyo a la Secretaría de Salud. No se leerán datos personales ni documentos en voz alta.',
 tracking:'Para proteger tu información, inicia sesión con el correo asociado a tu solicitud. Si no tienes una cuenta asociada, consulta los canales de atención de la Alcaldía.',
 legal:'Aquí encuentras información sobre privacidad, tratamiento de datos, condiciones de uso y accesibilidad. Puedes consultar los canales oficiales para ejercer tus derechos.',
 communications:'Consulta los avisos de la Secretaría de Salud que están vigentes.',
 admin:'Acceso institucional. Utiliza una cuenta autorizada. Por privacidad, este lector no reproduce información de expedientes ni datos personales.'
});
const create=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e};
const button=(text,fn,kind='secondary')=>{const b=create('button',text,kind);b.type='button';b.onclick=fn;return b};
export function accessiblePortal({navigate}){
 let current='catalog',active=null,paused=false,previousFocus=null;
 const toolbar=document.querySelector('.tools');
 const trigger=button('Escuchar guía',()=>open(),'quiet voice-entry');
 trigger.setAttribute('aria-haspopup','dialog');toolbar.insertBefore(trigger,document.getElementById('signout'));
 const d=create('dialog',undefined,'institution-dialog voice-dialog');
 d.setAttribute('aria-labelledby','voice-title');
 const h=create('h2','Accesibilidad y lectura por voz');h.id='voice-title';
 const explain=create('p','Escucha una orientación de la página actual. No se leen datos personales, formularios completados ni expedientes.');
 const text=create('p','','voice-transcript');
 const status=create('p','','voice-status');status.setAttribute('role','status');
 const controls=create('div',undefined,'voice-controls');
 const speedLabel=create('label','Velocidad de lectura '),speed=create('select');
 for(const [v,label] of [['0.8','Lenta'],['1','Normal'],['1.2','Rápida']]){const opt=create('option',label);opt.value=v;speed.append(opt);}speed.value='1';speedLabel.append(speed);
 const speak=button('Reproducir',()=>play(),'primary'),pause=button('Pausar',()=>togglePause()),stop=button('Detener',()=>cancel());
 pause.disabled=true;stop.disabled=true;
 controls.append(speak,pause,stop);
 const close=button('Cerrar',()=>d.close());
 d.append(h,explain,text,speedLabel,controls,status,close);document.body.append(d);
 const compatible=()=>typeof window.speechSynthesis!=='undefined'&&typeof window.SpeechSynthesisUtterance==='function';
 const voice=()=>compatible()?window.speechSynthesis.getVoices().find(v=>v.localService&&/^es(?:-|_|$)/i.test(v.lang)):null;
 function reset(){active=null;paused=false;pause.textContent='Pausar';pause.disabled=true;stop.disabled=true;}
 function cancel(){const was=active;reset();if(was&&compatible())window.speechSynthesis.cancel();status.textContent='Lectura detenida.';}
 function play(){
  if(!compatible()||!voice()){status.textContent='No hay una voz local en español disponible. Puedes leer la transcripción o usar el lector de pantalla de tu dispositivo.';return;}
  if(active)cancel();
  const u=new SpeechSynthesisUtterance(text.textContent);u.voice=voice();u.lang=u.voice.lang;u.rate=Number(speed.value);
  active=u;pause.disabled=false;stop.disabled=false;
  u.onend=()=>{if(active===u){reset();status.textContent='Lectura finalizada.';}};
  u.onerror=()=>{if(active===u){reset();status.textContent='No fue posible reproducir la guía. La transcripción sigue disponible.';}};
  status.textContent='Reproduciendo guía.';window.speechSynthesis.speak(u);
 }
 function togglePause(){if(!active||!compatible())return;if(paused){window.speechSynthesis.resume();paused=false;status.textContent='Reproduciendo guía.';}else{window.speechSynthesis.pause();paused=true;status.textContent='Lectura pausada.';}pause.textContent=paused?'Continuar':'Pausar';}
 function open(){if(document.querySelector('dialog[open]'))return;previousFocus=document.activeElement;text.textContent=guidance[current]||guidance.catalog;status.textContent='';d.showModal();speak.focus();}
 d.addEventListener('close',()=>{cancel();if(previousFocus?.isConnected)previousFocus.focus();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)cancel();});
 return {view(next){if(next!==current){if(active)cancel();if(d.open)d.close();current=next;}},open};
}
export function trackingAccess({login,navigate}){
 const panel=document.getElementById('tracking');
 const banner=create('div',undefined,'tracking-entry');
 const title=create('h2','Consulta protegida');
 const description=create('p','Ingresa con el correo asociado a tu solicitud. Los expedientes no se consultan únicamente por número de radicado.');
 const sign=button('Iniciar sesión para consultar',()=>open(),'primary');
 banner.append(title,description,sign);panel.querySelector('.section-head').after(banner);
 const dlg=create('dialog',undefined,'institution-dialog tracking-dialog');
 dlg.setAttribute('aria-labelledby','tracking-login-title');
 const heading=create('h2','Consulta tus solicitudes');heading.id='tracking-login-title';
 const body=create('p','Para verificar el estado de una solicitud debes ingresar con el mismo correo electrónico asociado al expediente. Esto protege tu información y tus documentos.');
 const noMail=create('p','Si no tienes un correo asociado, solicita orientación a la Secretaría de Salud por los canales oficiales. No compartas tu identificación ni documentos por medios no autorizados.','module-intro');
 const feedback=create('p','','error');feedback.setAttribute('role','alert');
 const go=button('Ingresar con Google',async()=>{go.disabled=true;feedback.textContent='';try{await login();}catch(e){feedback.textContent=e.message||'No se pudo iniciar sesión.';}finally{go.disabled=false;}},'primary');
 const back=button('Volver al catálogo',()=>{dlg.close();navigate('catalog');});
 const close=button('Cerrar',()=>dlg.close());
 const actions=create('div',undefined,'voice-controls');actions.append(go,back,close);
 dlg.append(heading,body,noMail,feedback,actions);document.body.append(dlg);
 let previous=null,shown=false,ready=false;
 function open(){if(ready||dlg.open||document.querySelector('dialog[open]'))return;previous=document.activeElement;feedback.textContent='';dlg.showModal();go.focus();shown=true;}
 dlg.addEventListener('close',()=>{if(previous?.isConnected)previous.focus();});
 return{view(v,allowed){ready=!!allowed;banner.hidden=ready;if(v!=='tracking'){shown=false;if(dlg.open)dlg.close();return;}if(ready){if(dlg.open)dlg.close();return;}if(!shown)open();},session(allowed){ready=!!allowed;banner.hidden=ready;if(ready&&dlg.open)dlg.close();}};
}
