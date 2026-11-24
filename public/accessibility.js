// Public guidance only. No form values, expedientes, emails or documents are spoken.
const guidance=Object.freeze({
 home:'Estás en el inicio de SITS Salud. Consulta trámites, haz seguimiento de tus solicitudes o abre la sección de ayuda.',
 help:'Consulta las preguntas frecuentes y los canales de la Secretaría de Salud.',
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
export function accessiblePortal(){
 let current='catalog',enabled=false,paused=false,active=null,pending=0,last='',lastNode=null;
 const synth=()=>window.speechSynthesis;
 const compatible=()=>typeof window.speechSynthesis!=='undefined'&&typeof window.SpeechSynthesisUtterance==='function';
 const voice=()=>compatible()?synth().getVoices().filter(v=>v.localService&&/^es(?:-|_|$)/i.test(v.lang)).sort((a,b)=>Number(b.lang.toLowerCase()==='es-co')-Number(a.lang.toLowerCase()==='es-co'))[0]:null;
 const toolbar=document.querySelector('.tools');
 const trigger=document.getElementById('voice-toggle')||button('Escuchar guía',()=>{},'quiet voice-entry');
 trigger.onclick=()=>setEnabled(!enabled);trigger.id='voice-toggle';
 trigger.setAttribute('aria-pressed','false');trigger.setAttribute('aria-controls','voice-guide');
 if(!trigger.isConnected)toolbar.insertBefore(trigger,document.getElementById('signout'));
 // Inline, non-modal: the rest of the document remains interactive and focus never moves.
 const panel=create('aside',undefined,'voice-dock');panel.id='voice-guide';panel.hidden=true;panel.setAttribute('aria-labelledby','voice-guide-title');
 const inner=create('div',undefined,'voice-dock-inner'),copy=create('div',undefined,'voice-dock-copy'),h=create('h2','Guía de voz activa');h.id='voice-guide-title';
 const subtitle=create('p','Pasa el puntero sobre los elementos o usa Tab. La guía no lee datos personales.');
 const text=create('p','','voice-transcript');text.id='voice-transcript';
 const status=create('p','','voice-status');status.setAttribute('role','status');
 const controls=create('div',undefined,'voice-controls'),speedLabel=create('label','Velocidad '),speed=create('select');speed.setAttribute('aria-label','Velocidad de lectura');
 for(const [v,label] of [['0.8','Lenta'],['1','Normal'],['1.2','Rápida']]){const opt=create('option',label);opt.value=v;speed.append(opt);}speed.value='1';speedLabel.append(speed);
 const replay=button('Repetir',()=>announce(text.textContent||guidance[current],true)),pause=button('Pausar',()=>{paused=!paused;pause.textContent=paused?'Continuar':'Pausar';pause.setAttribute('aria-pressed',String(paused));clearTimeout(pending);cancel();status.textContent=paused?'Lectura pausada.':'Guía activa.';if(!paused)announce(guidance[current],true);}),stop=button('Desactivar',()=>setEnabled(false),'primary');
 pause.setAttribute('aria-pressed','false');controls.append(speedLabel,replay,pause,stop);copy.append(h,subtitle,text,status);inner.append(copy,controls);panel.append(inner);document.querySelector('.top').after(panel);
 function cancel(){if(active&&compatible()){active=null;synth().cancel();}else active=null;}
 function announce(value,force=false){
  if(!enabled||paused||!value)return;
  const phrase=String(value).replace(/\s+/g,' ').trim().slice(0,460);if(!phrase||(!force&&phrase===last))return;
  last=phrase;text.textContent=phrase;cancel();
  const localVoice=voice();
  if(!localVoice){status.textContent='La guía visual sigue activa. No hay una voz local en español disponible.';return;}
  const utterance=new SpeechSynthesisUtterance(phrase);utterance.voice=localVoice;utterance.lang=localVoice.lang;utterance.rate=Number(speed.value);active=utterance;
  utterance.onend=()=>{if(active===utterance){active=null;status.textContent='Guía activa. Explora con el mouse o Tab.';}};
  utterance.onerror=()=>{if(active===utterance){active=null;status.textContent='No fue posible reproducir el audio. La guía visual está disponible.';}};
  status.textContent='Leyendo orientación.';try{synth().speak(utterance);}catch{active=null;status.textContent='Audio no disponible. Consulta la guía visual.';}
 }
 function setEnabled(on){
  enabled=on;paused=false;last='';lastNode=null;clearTimeout(pending);cancel();panel.hidden=!on;trigger.setAttribute('aria-pressed',String(on));trigger.textContent=on?'Guía activa · apagar':'Escuchar guía';pause.textContent='Pausar';pause.setAttribute('aria-pressed','false');
  if(on)announce('Guía activada. Puedes seguir navegando sin restricciones. '+(guidance[current]||guidance.catalog),true);
  else if(panel.contains(document.activeElement))trigger.focus({preventScroll:true});
 }
 // No arbitrary DOM text, values, filenames, staff records, requests, notices, or policy content.
 // Only explicit public catalogue hints and a fixed dictionary of navigation/control instructions.
 const actions=Object.freeze({
  'Catálogo':'Catálogo. Consulta los trámites y servicios disponibles.',
  'Solicitud ciudadana':'Solicitud ciudadana. Accede al formulario autorizado.',
  'Mis solicitudes':'Mis solicitudes. Consulta el seguimiento con tu cuenta.',
  'Gestión de Salud':'Gestión de Salud. Acceso reservado al personal autorizado.',
  'Avisos':'Avisos institucionales. Consulta las comunicaciones vigentes.',
  'Centro legal':'Centro legal. Consulta privacidad, condiciones y accesibilidad.',
  'Contraste':'Contraste. Cambia el contraste de la interfaz.',
  'Ampliar texto':'Ampliar texto. Aumenta el tamaño de las letras.',
  'Reducir texto':'Reducir texto. Disminuye el tamaño de las letras.',
  'Restablecer':'Restablecer. Vuelve a la configuración visual inicial.',
  'Acceso institucional de Salud':'Acceso institucional. Ingresa con tu cuenta autorizada.',
  'Buscar trámite':'Buscador de trámites. Escribe un nombre o una palabra clave.',
  'Categoría':'Categoría. Selecciona un grupo de servicios.',
  'Vista de tarjetas':'Vista de tarjetas. Organiza los servicios en una cuadrícula.',
  'Vista de lista':'Vista de lista. Organiza los servicios en filas.',
  'Limpiar filtros':'Limpiar filtros. Muestra todos los servicios.',
  'Ingresar con Google':'Ingresar con Google. Selecciona la cuenta asociada.',
  'Iniciar sesión para consultar':'Inicia sesión con el correo asociado a la solicitud.',
  'Consultar catálogo':'Volver al catálogo de servicios.',
  'Acceso autorizado':'Acceso al formulario para cuentas habilitadas.',
  'Preparar requisitos sin iniciar sesión':'Consulta una lista para preparar requisitos sin enviar información.',
  'Actualizar listado':'Actualiza la lista de solicitudes disponibles.',
  'Cerrar':'Cierra esta ventana.',
  'Continuar':'Continúa al siguiente paso del formulario.',
  'Atrás':'Regresa al paso anterior.',
  'Ver trámite':'Consulta la ficha y los requisitos del servicio.'
 });
 const selector='[data-voice-hint],button,a,input,select,textarea,h1,h2,h3,[role=button]';
 function targetFor(el){if(!(el instanceof Element)||panel.contains(el)||el===trigger)return null;return el.closest(selector);}
 function describe(el){
  if(!el||el.closest('[hidden],.hidden,[aria-hidden=true]'))return '';
  if(el.hasAttribute('data-voice-hint')&&el.closest('#catalog,#service'))return el.dataset.voiceHint||'';
  if(el.closest('#adminDashboard,#trackingList,#details,.catalog-manager,.institutional-admin'))return el.matches('input,select,textarea')?'Campo de gestión. No se leen datos personales.':'Elemento de gestión. La lectura de datos privados está desactivada.';
  if(el.matches('input,select,textarea')){
   const label=el.getAttribute('aria-label');
   if(label&&Object.hasOwn(actions,label))return actions[label];
   return el.matches('input[type=file]')?'Campo para adjuntar un documento. No se lee el nombre del archivo.':el.matches('input[type=checkbox],input[type=radio]')?'Opción de selección. Revisa la etiqueta con tu lector de pantalla.':el.matches('select')?'Lista de opciones. Usa las flechas para elegir.':'Campo del formulario. No se leen los valores.';
  }
  const aria=el.getAttribute('aria-label');
  if(aria&&Object.hasOwn(actions,aria))return actions[aria];
  if(el.matches('button,a')){const name=el.textContent.replace(/\s+/g,' ').trim().replace(/\s*[→↗]$/,'');if(Object.hasOwn(actions,name))return actions[name];}
  if(el.matches('h1'))return guidance[current];
  if(el.matches('button,[role=button]'))return 'Botón. Puedes activarlo con Enter o espacio.';
  if(el.matches('a'))return 'Enlace. Puedes abrirlo con Enter.';
  return '';
 }
 function schedule(el,delay){if(!enabled||paused)return;const target=targetFor(el);if(!target)return;const phrase=describe(target);if(!phrase)return;if(target===lastNode&&phrase===last)return;clearTimeout(pending);lastNode=target;pending=setTimeout(()=>{if(target.isConnected)announce(phrase);},delay);}
 document.addEventListener('pointerover',e=>{if(e.pointerType!=='touch')schedule(e.target,220);});
 document.addEventListener('pointerout',e=>{const from=targetFor(e.target),to=targetFor(e.relatedTarget);if(from&&from!==to){clearTimeout(pending);if(lastNode===from)lastNode=null;}});
 document.addEventListener('focusin',e=>schedule(e.target,60));
 document.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')schedule(e.target,0);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(pending);cancel();}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&enabled&&!document.querySelector('dialog[open]'))setEnabled(false);});
 if(compatible())synth().addEventListener?.('voiceschanged',()=>{if(enabled&&!paused&&!active&&voice())announce(text.textContent,true);});
 return {view(next){current=next;clearTimeout(pending);lastNode=null;if(enabled&&!paused)announce(guidance[next]||guidance.catalog,true);},open(){setEnabled(true);}};
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
