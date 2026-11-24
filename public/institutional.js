const byId=id=>document.getElementById(id);
const make=(tag,text,cls)=>{
  const element=document.createElement(tag);
  if(text!=null)element.textContent=text;
  if(cls)element.className=cls;
  return element;
};
const button=(label,action,kind='secondary')=>{
  const b=make('button',label,kind);
  b.type='button';
  b.onclick=action;
  return b;
};
const policyTitles={
  processing:'Política de tratamiento de datos personales',privacy:'Aviso de privacidad',
  terms:'Términos y condiciones',storage:'Cookies y almacenamiento',
  accessibility:'Declaración de accesibilidad',sensitive:'Autorización de datos sensibles'
};
const rightsTitles={access:'Conocer o consultar los datos',update:'Actualizar datos',rectification:'Rectificar datos',
  suppression:'Solicitar supresión',proof:'Solicitar prueba de autorización',revocation:'Solicitar revocación'};
const legalFallback={
  "processing": "La Alcaldía Municipal de San Pedro, Valle del Cauca, administra este portal de la Secretaría de Salud. En la operación habilitada se utilizan el correo verificado, identificador de cuenta, registros de acceso, decisiones de privacidad y expedientes sintéticos. Las finalidades son autenticar, permitir seguimiento, proteger el servicio y registrar actuaciones. Supabase gestiona la autenticación y los registros. Google Workspace gestiona el almacenamiento de documentos y las comunicaciones. No se ha habilitado la recepción clínica oficial. El tratamiento se rige por la Ley 1581 de 2012 y el Decreto 1074 de 2015. Los derechos de conocimiento, acceso, actualización, rectificación, prueba de autorización, información del uso, revocación y supresión se ejercen a través de los canales oficiales de la Alcaldía, con las excepciones y obligaciones de conservación aplicables. Después de agotar la consulta o reclamación ante el responsable podrá acudir a la SIC cuando proceda. La política definitiva debe incorporar las condiciones institucionales de custodia, retención, encargados y transmisión, previa aprobación.",
  "privacy": "El portal público permite consultar el catálogo sin iniciar sesión. En la zona autenticada se verifica el correo y la identidad de la cuenta; la consulta de expedientes exige autorización. Los avisos por correo son voluntarios cuando corresponda y no equivalen automáticamente a notificación administrativa. No se ha habilitado la recepción de documentos clínicos reales. Consulta la política institucional, las finalidades y los canales oficiales antes de proporcionar información. Los derechos del titular se tramitan conforme a la Ley 1581 de 2012.",
  "terms": "SITS Salud es un portal municipal de orientación, consulta y gestión de servicios. La publicación del sitio no constituye por sí misma habilitación de radicación electrónica oficial. La certificación de discapacidad está regulada por la Resolución 1197 de 2024 del Ministerio de Salud y Protección Social; este portal no sustituye el RLCPD ni la valoración multidisciplinaria. Las referencias de validación institucional no constituyen radicados oficiales ni certificados válidos. El uso de medios electrónicos y las notificaciones administrativas se sujetan a la Ley 1437 de 2011, modificada por la Ley 2080 de 2021, y al procedimiento que adopte la entidad. Consulta los canales oficiales si requieres atención.",
  "storage": "El servicio usa almacenamiento de sesión para preferencias de avisos y el almacenamiento de sesión para mantener el ingreso con Google mediante Supabase. Los formularios se mantienen en memoria y los PDF no se guardan en almacenamiento web. La función de voz utiliza únicamente voces locales disponibles en el dispositivo, voluntariamente, y no lee información personal ni envía texto a servicios de voz externos desde la aplicación. No se inicializa analítica. La información sobre tecnologías del proveedor, conservación y transmisión debe completarse en la política institucional adoptada.",
  "accessibility": "El portal incorpora navegación por teclado, foco visible, texto ajustable, contraste, movimiento reducido, transcripciones y una guía de voz local opcional en español cuando el dispositivo dispone de ella. Se toma como mínimo aplicable WCAG 2.1 AA según Resolución MinTIC 1519 de 2020 y como objetivo técnico WCAG 2.2 AA, junto con Ley 1618 de 2013 y Resolución 2893 de 2020 según alcance. Las pruebas automáticas no certifican accesibilidad total; se requieren evaluación manual y pruebas con personas usuarias y tecnologías de asistencia. Reporta barreras por los canales oficiales, indicando la página y el obstáculo sin revelar información clínica.",
  "sensitive": "Los datos de salud son sensibles (Ley 1581 de 2012, artículos 5 y 6). Su recolección requiere una finalidad legítima, base jurídica y medidas de protección; cuando la autorización sea exigible deberá ser previa, expresa, informada y diferenciada de otros actos. Se informará el carácter facultativo de las respuestas relativas a datos sensibles conforme al régimen aplicable. La recepción clínica oficial aún no está habilitada. La entidad deberá aprobar las finalidades, las condiciones de representación y apoyos, la custodia, los accesos y la retención antes de habilitarla."
};

const labels={
  public:'Público',citizen:'Ciudadanía autenticada',staff:'Personal habilitado',
  banner:'Banner',modal:'Ventana',inbox:'Bandeja',session:'Una vez por sesión y versión',always:'Mientras esté vigente',
  info:'Informativo',warning:'Advertencia',urgent:'Urgente',draft:'Borrador',review:'En revisión',
  approved:'Aprobado en el sistema',published:'Publicado',withdrawn:'Retirado',
  received:'Recibida',assigned:'Asignada',answered:'Respondida',notice:'Conocimiento del aviso',
  terms:'Aceptación de términos',electronic_notice:'Comunicaciones electrónicas',
  acknowledged:'Leído',accepted:'Aceptado',granted:'Autorizadas',declined:'Rechazadas'
};
const colDate=new Intl.DateTimeFormat('es-CO',{dateStyle:'short',timeStyle:'short',timeZone:'America/Bogota'});
const timestamp=t=>t?colDate.format(t):'Sin fecha configurada';
const localInput=t=>t?new Date(t-5*3600000).toISOString().slice(0,16):'';
const colombiaTime=s=>Date.parse(s+'-05:00');
const official='https://www.sanpedro-valle.gov.co/';
const field=(parent,label,name,{value='',type='text',options,max,min,required=true}={})=>{
  const wrap=make('label',label), input=make(options?'select':type==='textarea'?'textarea':'input');
  if(options){
    input.setAttribute('aria-label',label);
    for(const [id,name] of Object.entries(options)){const opt=make('option',name);opt.value=id;input.append(opt);}
  }
  else if(type!=='textarea')input.type=type;
  input.name=name;
  input.required=required;
  if(max!=null){if(type==='number')input.max=max;else input.maxLength=max;}
  if(min!=null)input.min=min;
  if(type==='textarea')input.rows=5;
  input.value=value;
  wrap.append(input);
  parent.append(wrap);
  return input;
};
const options=ids=>Object.fromEntries(ids.map(id=>[id,labels[id]]));
const section=(id,title,intro)=>{
  const el=make('section',null,'view hidden');
  el.id=id;
  const heading=make('h1',title);
  heading.tabIndex=-1;
  el.append(heading,make('p',intro,'module-intro'));
  return el;
};
function brand(){
  const logo=make('img',null,'institution-logo');
  logo.src='./assets/brand/alcaldia-san-pedro.png';
  logo.alt='';
  logo.width=1920;
  logo.height=1080;
  return logo;
}
const legalLink=(navigate)=>{
  const link=make('a','Centro legal');
  link.href='#legal';
  link.onclick=e=>{e.preventDefault();navigate('legal');};
  return link;
};

export function portalExperience({demo,navigate,invoke}){
  const main=byId('main');
  const legal=section('legal','Centro legal','Privacidad, condiciones de uso, accesibilidad y derechos de los titulares.');
  const communications=section('communications','Avisos institucionales','Consulta las comunicaciones vigentes para esta aplicación.');
  const legalDocs=make('div',null,'document-grid');
  const accountRegion=make('div',null,'module-panel');
  const messageList=make('div',null,'document-grid');
  const banners=make('aside',null,'institutional-banners');
  banners.setAttribute('aria-label','Avisos actuales');
  const toast=make('div',null,'institution-toast hidden');
  toast.setAttribute('role','status');
  const dialog=make('dialog',null,'institution-dialog');
  const dialogTitle=make('h2');
  dialogTitle.id='institutionDialogTitle';
  dialog.setAttribute('aria-labelledby',dialogTitle.id);
  const dialogBody=make('div',null,'institution-dialog-body');
  const close=button('Cerrar',()=>dialog.close());
  const dialogStatus=make('p',null,'error');
  dialogStatus.setAttribute('role','alert');
  dialog.append(dialogTitle,dialogBody,dialogStatus,close);
  const contact=make('div',null,'module-panel');
  const home=make('a','Sede electrónica de la Alcaldía');
  home.href=official;
  const email=make('a','alcaldia@sanpedro-valle.gov.co');
  email.href='mailto:alcaldia@sanpedro-valle.gov.co';
  contact.append(make('h2','Canales oficiales'),make('p','Consulte atención al ciudadano, transparencia, participación y el canal de peticiones en la sede municipal.'),home,make('p','Correo institucional'),email);
  const siteMap=make('nav',null,'module-panel');
  siteMap.setAttribute('aria-label','Mapa del portal');
  siteMap.append(make('h2','Mapa del portal'));
  for(const [id,label] of [['citizen','Solicitud ciudadana'],['tracking','Seguimiento'],['communications','Avisos'],['legal','Centro legal']]){
    const link=make('a',label);
    link.href='#'+id;link.onclick=e=>{e.preventDefault();navigate(id);};
    siteMap.append(link);
  }
  legal.append(legalDocs,contact,accountRegion,siteMap);
  const refreshNotices=button('Actualizar avisos',()=>{
    if(session)void refreshPrivate();
    else if(publicEndpoint)void experience.publicEndpoint(publicEndpoint);
  });
  refreshNotices.hidden=demo;
  communications.append(refreshNotices,messageList);
  main.prepend(banners);
  main.append(legal,communications);
  document.body.append(toast,dialog);
  document.querySelector('.brand .mark')?.replaceWith(brand());
  for(const selector of ['#adminLogin','#authCitizen','.side .panel','#receipt','footer']){
    const item=document.querySelector(selector);
    if(item)item.prepend(brand());
  }
  document.querySelector('footer').append(legalLink(navigate));
  for(const area of ['#authCitizen','#adminLogin'])document.querySelector(area)?.append(legalLink(navigate));
  const nav=document.querySelector('.nav');
  for(const [view,label] of [['communications','Avisos'],['legal','Centro legal']]){
    const entry=button(label,()=>navigate(view),'navbtn');entry.dataset.view=view;nav.append(entry);
  }
  const context=make('span','Portada', 'portal-context');
  nav.after(context);
  const controls=document.querySelector('.tools');
  controls.insertBefore(button('Reducir texto',()=>{document.documentElement.classList.remove('large');document.documentElement.classList.toggle('small-text');byId('scale').setAttribute('aria-pressed','false');},'quiet'),byId('signout'));
  controls.insertBefore(button('Restablecer',()=>{
    document.body.classList.remove('hc');document.documentElement.classList.remove('large','small-text');
    for(const id of ['contrast','scale'])byId(id).setAttribute('aria-pressed','false');
  },'quiet'),byId('signout'));
  byId('scale').addEventListener('click',()=>document.documentElement.classList.remove('small-text'));
  let session=null, capability=false, publicContent={notices:[],policies:[]}, privateContent=null, selectedView='citizen';
  let focusBeforeDialog, toastTimer, rightsKey, noticeTimer, publicEndpoint;
  const seen=new Set();
  const manager=make('div',null,'module-panel institutional-admin');
  manager.hidden=true;
  const adminMenu=make('nav',null,'admin-module-menu');
  adminMenu.setAttribute('aria-label','Módulos de Salud');
  const adminPanel=byId('adminDashboard');
  adminMenu.append(brand(),button('Expedientes',()=>{manager.hidden=true;adminPanel.dataset.activeModule='cases';adminPanel.querySelector('.dashbar').scrollIntoView({block:'nearest'});}),
    button('Avisos',()=>void loadManagement('notices')),button('Políticas',()=>void loadManagement('policies')),
    button('Solicitudes de titulares',()=>void loadManagement('rights')));
  const adminNav=make('details',null,'admin-module-nav');
  adminNav.append(make('summary','Menú institucional'),adminMenu);
  adminPanel.prepend(adminNav);
  adminMenu.addEventListener('click',event=>{
    const selected=event.target.closest('button');if(!selected)return;
    for(const control of adminMenu.querySelectorAll('button')){if(control===selected)control.setAttribute('aria-current','page');else control.removeAttribute('aria-current');}
  });
  adminPanel.append(manager);
  adminNav.hidden=!demo;

  function showToast(text){
    clearTimeout(toastTimer);toast.textContent=text;toast.classList.remove('hidden');
    toastTimer=setTimeout(()=>toast.classList.add('hidden'),4500);
  }
  function open(title,children,action){
    if(dialog.open)return false;
    focusBeforeDialog=document.activeElement;
    dialogTitle.textContent=title;
    dialogStatus.textContent='';
    dialogBody.replaceChildren(...children);
    if(action)dialogBody.append(action);
    dialog.showModal();
    close.focus();
    return true;
  }
  dialog.addEventListener('close',()=>{
    if(focusBeforeDialog?.isConnected)focusBeforeDialog.focus();
    else manager.querySelector('h2')?.focus();
  });
  function busyForm(form,fn,error){
    form.onsubmit=async event=>{
      event.preventDefault();
      const submit=form.querySelector('[type=submit]');
      submit.disabled=true;
      form.setAttribute('aria-busy','true');
      error.textContent='';
      try{await fn(Object.fromEntries(new FormData(form)));}
      catch(e){error.textContent=e.message;}
      finally{submit.disabled=false;form.removeAttribute('aria-busy');}
    };
  }
  function submitButton(form,label){
    const b=make('button',label,'primary');b.type='submit';form.append(b);return b;
  }
  function seenNotice(key){
    try{return seen.has(key)||sessionStorage.getItem('sits-notice-'+key)==='1';}
    catch{return seen.has(key);}
  }
  function markSeen(key){
    seen.add(key);try{sessionStorage.setItem('sits-notice-'+key,'1');}catch{}
  }
  function render(allowModal=false){
    const current=privateContent??publicContent;
    const notices=current.notices.filter(n=>n.start<=Date.now()&&n.end>Date.now());
    banners.replaceChildren();
    messageList.replaceChildren();
    for(const item of notices){
      const box=make('article',null,'notice-card severity-'+item.severity);
      box.append(make('h2',item.title),make('p',item.body,'plain-content'),make('small',labels[item.severity]+' · Vigente hasta '+timestamp(item.end)));
      messageList.append(box);
      if(item.channel==='banner'&&!seenNotice('banner:'+item.id+':'+item.version)){
        const strip=make('div',null,'notice-strip severity-'+item.severity);
        strip.append(make('strong',item.title),make('p',item.body,'plain-content'));
        if(item.frequency==='session')strip.append(button('Cerrar aviso',()=>{markSeen('banner:'+item.id+':'+item.version);render();}));
        banners.append(strip);
      }
    }
    if(!notices.length)messageList.append(make('p','No hay avisos vigentes.','module-panel'));
    if(allowModal&&['citizen','catalog'].includes(selectedView)&&!document.activeElement?.closest('form')){
      const item=notices.find(x=>x.channel==='modal'&&(x.frequency==='always'||!seenNotice(x.id+':'+x.version)));
      if(item&&open(item.title,[make('p',item.body,'plain-content')]))markSeen(item.id+':'+item.version);
    }
    clearTimeout(noticeTimer);
    const boundary=current.notices.flatMap(n=>[n.start,n.end]).filter(t=>t>Date.now()).sort((a,b)=>a-b)[0];
    if(boundary)noticeTimer=setTimeout(()=>render(false),Math.min(2147483647,boundary-Date.now()+50));
    legalDocs.replaceChildren();
    for(const [kind,title] of Object.entries(policyTitles)){
      const official=current.policies.find(d=>d.kind===kind);
      const item=make('article',null,'module-panel legal-document');
      item.id='legal-'+kind;
      item.append(make('h2',official?.title??title),make('p',official?'Versión '+official.version+' · Vigente desde '+timestamp(official.effective):'Documento informativo · Pendiente de aprobación institucional','doc-status'),
        make('p',official?.body??legalFallback[kind],'plain-content'));
      legalDocs.append(item);
    }
    const basis=make('article',null,'module-panel legal-document');basis.append(make('h2','Marco normativo y consulta oficial'),make('p','Referencias verificadas para la información pública. La política institucional publicada en el sistema prevalece sobre los textos informativos.','plain-content'));
    for(const [label,url] of [["Ley 1581 de 2012 · Protección de datos","https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981"],["Ley 1618 de 2013 · Inclusión y accesibilidad","https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=52081"],["Resolución MinTIC 1519 de 2020","https://normograma.mintic.gov.co/mintic/compilacion/docs/resolucion_mintic_1519_2020.htm"],["Resolución MinTIC 2893 de 2020","https://normograma.mintic.gov.co/mintic/compilacion/docs/resolucion_mintic_2893_2020.htm"],["Resolución MinTIC 2277 de 2025 · MSPI","https://normograma.mintic.gov.co/mintic/compilacion/docs/resolucion_mintic_2277_2025.htm"],["Resolución 1197 de 2024 · Certificación","https://www.cancilleria.gov.co/normograma/compilacion/docs/resolucion_minsaludps_1197_2024.htm"],["Ley 1437 de 2011 · CPACA","https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=41249"]]){const p=make('p'),a=make('a',label);a.href=url;p.append(a);basis.append(p);}legalDocs.append(basis);
  }
  function loading(target){
    target.replaceChildren();
    const visible=make('p','Cargando información…');visible.setAttribute('role','status');
    const skeleton=make('div',null,'portal-skeleton');skeleton.setAttribute('aria-hidden','true');
    target.append(visible,skeleton);
  }
  function showError(target,error,retry){
    const text=make('p',error.message,'error');text.setAttribute('role','alert');target.replaceChildren(text);
    if(retry)target.append(button('Reintentar',retry));
  }
  async function loadAccount(){
    accountRegion.replaceChildren(make('h2','Derechos y decisiones registradas'));
    accountRegion.append(make('p','Puede solicitar acceso, actualización, rectificación, supresión, prueba de autorización o revocación. La custodia documental y las obligaciones aplicables pueden limitar la supresión. Para una solicitud real utilice los canales oficiales.'));
    if(!session||!capability){accountRegion.append(make('p','Inicie sesión con una cuenta autorizada para consultar sus decisiones.'));return;}
    const scope=session;
    const result=make('div');
    accountRegion.append(result);loading(result);
    try{
      const [cases,evidence]=await Promise.all([invoke('rightsMine'),invoke('evidenceList')]);
      if(scope!==session)return;
      result.replaceChildren();
      const form=make('form',null,'compact-form');
      field(form,'Derecho que desea ejercer en la prueba','kind',{options:rightsTitles});
      const error=make('p',null,'error');error.setAttribute('role','alert');
      submitButton(form,'Registrar solicitud de prueba');
      form.append(error);
      busyForm(form,async d=>{
        rightsKey??=crypto.randomUUID();
        await invoke('rightsCreate',{...d,key:rightsKey});rightsKey=null;
        showToast('Solicitud de prueba registrada.');await loadAccount();
      },error);
      result.append(form,make('h3','Mis solicitudes de prueba'));
      if(!cases.items.length)result.append(make('p','Aún no hay solicitudes.'));
      for(const row of cases.items){
        const card=make('article',null,'record');
        card.append(make('strong',rightsTitles[row.kind]),make('p',labels[row.state]+' · '+timestamp(row.createdAt)));
        if(row.answer)card.append(make('p',row.answer,'plain-content'));
        result.append(card);
      }
      result.append(make('h3','Historial de decisiones'));
      for(const row of evidence.items){
        const card=make('article',null,'record');
        card.append(make('strong',labels[row.act]),make('p',labels[row.decision]+' · Versión '+row.version+' · '+timestamp(row.at)));
        result.append(card);
      }
      if(evidence.items.length)result.append(button('Descargar constancia de decisiones',()=>{
        const data=new Blob([JSON.stringify(evidence.items,null,2)],{type:'application/json'});
        const url=URL.createObjectURL(data),a=make('a');a.href=url;a.download='decisiones-del-piloto.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }));
      else result.append(make('p','Aún no hay decisiones registradas.'));
    }catch(e){if(scope===session)showError(result,e,loadAccount);}
  }
  let demoNotices=[];
  async function manageApi(action,data){
    if(!demo)return invoke(action,data);
    if(action==='institutionalAdmin')return {notices:demoNotices,policies:[],reviewer:false,rights:false};
    if(action==='institutionalHistory')return {items:[]};
    if(action==='noticeSave'){
      const old=demoNotices.find(x=>x.id===data.id);
      const id=old?.id??crypto.randomUUID(), version=(old?.version??0)+1;
      const next={id,version,state:'draft',draft:{...data,id,version},live:old?.live??null};
      demoNotices=[...demoNotices.filter(x=>x.id!==id),next];return next;
    }
    if(action==='noticeChange'){
      const row=demoNotices.find(x=>x.id===data.id);
      row.state=data.state;row.version++;row.live=data.state==='published'?row.draft:null;
      publicContent={notices:demoNotices.map(x=>x.live).filter(x=>x?.audience==='public'),policies:[]};
      render(data.state==='published');return row;
    }
    throw Error('Esta acción requiere una cuenta habilitada.');
  }
  async function loadManagement(view){
    adminPanel.dataset.activeModule=view;
    manager.hidden=false;
    loading(manager);
    try{
      const data=await manageApi('institutionalAdmin');
      if(manager.hidden||(!demo&&!session))return;
      const title=make('h2',view==='notices'?'Centro de avisos':view==='policies'?'Documentos legales':'Derechos de los titulares');
      title.tabIndex=-1;
      manager.replaceChildren(title);
      if(view==='notices')renderNotices(data.notices);
      else if(view==='policies')renderPolicies(data);
      else if(data.rights)renderRights((await invoke('rightsInbox')).items);
      else manager.append(make('p','Este módulo requiere una asignación institucional de protección de datos.'));
      manager.scrollIntoView({block:'nearest'});
    }catch(e){showError(manager,e,()=>loadManagement(view));}
  }
  const mutate=async(action,data,view)=>{
    await manageApi(action,data);showToast('Cambios registrados.');
    await loadManagement(view);
    if(!demo)void refreshPrivate();
  };
  function task(label,action,data,view){
    const b=button(label,async()=>{
      b.disabled=true;const error=make('p',null,'error');error.setAttribute('role','alert');b.after(error);
      try{await mutate(action,data,view);}catch(e){error.textContent=e.message;}finally{b.disabled=false;}
    });
    return b;
  }
  function history(entity){
    return button('Ver historial',async()=>{
      try{
        const result=await manageApi('institutionalHistory',{entity});
        const list=make('ol');
        for(const item of result.items){
          const line=make('li',timestamp(item.at)+' · '+labels[item.snapshot.state]+' · Versión '+item.snapshot.version+' · '+item.actorUid);
          const body=item.snapshot.draft?.body;
          if(body)line.append(make('p',body,'plain-content'));
          list.append(line);
        }
        open('Historial de versiones',[result.items.length?list:make('p','Sin versiones registradas en este entorno.')]);
      }catch(e){open('No se pudo consultar el historial',[make('p',e.message)]);}
    });
  }
  function renderNotices(items){
    if(demo)manager.append(make('p','Demostración. Los cambios se conservan solo mientras esta página esté abierta.'));
    manager.append(button('Crear aviso',()=>editNotice()));
    if(!items.length)manager.append(make('p','No hay avisos configurados.'));
    for(const item of items){
      const card=make('article',null,'record');
      const {draft,id,version}=item;
      card.append(make('h3',draft.title),make('p',labels[item.state]+' · '+timestamp(draft.start)+' a '+timestamp(draft.end)),
        make('p',draft.body,'plain-content'),button('Editar aviso',()=>editNotice(item)),history('notice-'+id));
      if(item.state==='draft')card.append(task('Publicar o programar','noticeChange',{id,version,state:'published'},'notices'));
      if(item.live)card.append(task('Retirar aviso','noticeChange',{id,version,state:'withdrawn'},'notices'));
      manager.append(card);
    }
  }
  function editNotice(item){
    const form=make('form',null,'compact-form'), d=item?.draft??{};
    field(form,'Título','title',{value:d.title,max:100});field(form,'Mensaje','body',{value:d.body,type:'textarea',max:1500});
    field(form,'Inicio en hora de Colombia','start',{value:localInput(d.start),type:'datetime-local'});
    field(form,'Fin en hora de Colombia','end',{value:localInput(d.end),type:'datetime-local'});
    field(form,'Prioridad de 0 a 100','priority',{value:d.priority??50,type:'number',min:0,max:100});
    for(const [name,label,ids] of [['severity','Severidad',['info','warning','urgent']],['audience','Destinatarios',['public','citizen','staff']],
      ['channel','Canal',['banner','modal','inbox']],['frequency','Frecuencia',['session','always']]]){
      field(form,label,name,{value:d[name]??ids[0],options:options(ids)});
    }
    field(form,'Trámite','service',{value:d.service??'all',options:{all:'Toda la aplicación',discapacidad:'Certificación de discapacidad'}});
    const preview=make('p',null,'notice-card plain-content');preview.hidden=true;
    form.append(button('Previsualizar',()=>{preview.textContent=form.elements.title.value+'\n'+form.elements.body.value;preview.hidden=false;}),preview);
    submitButton(form,'Guardar borrador');
    busyForm(form,async values=>{
      const data={...values,start:colombiaTime(values.start),end:colombiaTime(values.end),priority:Number(values.priority)};
      if(data.end<=data.start)throw Error('La fecha de fin debe ser posterior al inicio.');
      await mutate('noticeSave',{...data,id:item?.id,version:item?.version},'notices');dialog.close();
    },dialogStatus);
    open(item?'Editar aviso':'Nuevo aviso',[form]);
  }
  function renderPolicies(data){
    if(demo){manager.append(make('p','La edición y aprobación de políticas requieren acceso institucional.'));return;}
    for(const [kind,title] of Object.entries(policyTitles)){
      const item=data.policies.find(x=>x.kind===kind);
      const card=make('article',null,'record');
      card.append(make('h3',title),make('p',item?labels[item.state]+' · Versión '+item.version:'Pendiente de revisión institucional'),
        button('Editar documento',()=>editPolicy(kind,item)));
      if(item){
        const {version}=item;
        card.append(history('policy-'+kind));
        if(item.state==='draft')card.append(task('Enviar a revisión','policyChange',{kind,version,state:'review'},'policies'));
        if(item.state==='review'&&data.reviewer)card.append(button('Registrar decisión de aprobación',()=>approvePolicy(item)));
        if(item.state==='approved'&&kind!=='sensitive')card.append(task('Publicar versión','policyChange',{kind,version,state:'published'},'policies'));
        if(item.published)card.append(task('Retirar versión pública','policyChange',{kind,version,state:'withdrawn'},'policies'));
      }
      manager.append(card);
    }
  }
  function editPolicy(kind,item){
    const form=make('form',null,'compact-form');
    field(form,'Título','title',{value:item?.draft?.title??policyTitles[kind],max:120});
    field(form,'Contenido en texto plano','body',{value:item?.draft?.body??legalFallback[kind],type:'textarea',max:16000});
    submitButton(form,'Guardar borrador');
    busyForm(form,async values=>{await mutate('policySave',{...values,kind,version:item?.version??0},'policies');dialog.close();},dialogStatus);
    open('Editar documento legal',[form]);
  }
  function approvePolicy({kind,version,draft}){
    const form=make('form',null,'compact-form');
    field(form,'Referencia de decisión institucional','reference',{max:160});
    field(form,'Vigencia en hora de Colombia','effective',{type:'datetime-local'});
    submitButton(form,'Registrar aprobación');
    busyForm(form,async d=>{await mutate('policyChange',{kind,version,state:'approved',reference:d.reference,effective:colombiaTime(d.effective)},'policies');dialog.close();},dialogStatus);
    open('Revisar versión del documento',[make('p',draft.body,'plain-content'),form]);
  }
  function renderRights(items){
    if(!items.length)manager.append(make('p','No hay solicitudes registradas.'));
    for(const item of items){
      const card=make('article',null,'record');
      card.append(make('h3',rightsTitles[item.kind]),make('p',labels[item.state]+' · '+timestamp(item.createdAt)),
        make('p','Cuenta '+item.ownerUid+' · Plazo: '+timestamp(item.dueAt)));
      if(item.state==='received')card.append(task('Asignarme solicitud','rightsUpdate',{id:item.id,version:item.version,state:'assigned'},'rights'));
      if(item.state==='assigned'&&item.assigneeUid===session?.uid)card.append(button('Registrar respuesta',()=>{
        const form=make('form',null,'compact-form');
        field(form,'Respuesta de prueba sin datos personales','answer',{type:'textarea',max:1800});
        submitButton(form,'Guardar respuesta');
        busyForm(form,async d=>{await mutate('rightsUpdate',{...d,id:item.id,version:item.version,state:'answered'},'rights');dialog.close();},dialogStatus);
        open('Responder solicitud',[form]);
      }));
      if(item.answer)card.append(make('p',item.answer,'plain-content'));
      manager.append(card);
    }
  }
  async function refreshPrivate(){
    const scope=session;
    try{
      const result=await invoke('institutionalPublic');
      if(scope!==session)return;
      privateContent=result;capability=true;render(true);
    }catch{if(scope===session){privateContent=null;render();}}
  }
  let documents=[];
  const decisionsArea=make('fieldset',null,'portal-decisions');
  decisionsArea.hidden=true;
  const oldDecisions=Array.from(document.querySelectorAll('#applicationForm [name=consent], #applicationForm [name=synthetic]')).map(x=>x.closest('label'));
  oldDecisions[0]?.before(decisionsArea);
  if(oldDecisions[0])oldDecisions[0].before(legalLink(navigate));
  const receipt=byId('receipt');
  receipt.append(button('Guardar constancia accesible',async()=>{
    const ack=document.implementation.createHTMLDocument('Constancia de recepción del piloto');
    ack.documentElement.lang='es';
    const policy=ack.createElement('meta');
    policy.httpEquiv='Content-Security-Policy';policy.content="default-src 'none'; img-src data:";
    ack.head.prepend(policy);
    const logo=ack.createElement('img');logo.alt='Alcaldía Municipal de San Pedro';logo.width=256;logo.height=144;
    try{
      const response=await fetch('./assets/brand/alcaldia-san-pedro.png');
      if(response.ok){
        const bytes=new Uint8Array(await response.arrayBuffer());
        let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
        logo.src='data:image/png;base64,'+btoa(binary);ack.body.append(logo);
      }
    }catch{}
    for(const [tag,text] of [['h1','Constancia de recepción del piloto'],['p','Alcaldía Municipal de San Pedro · Secretaría de Salud'],['p','Referencia de prueba: '+byId('receiptId').textContent],['p',byId('receiptTitle').textContent],['p','Fecha de generación: '+timestamp(Date.now())],['p','Esta constancia corresponde a un entorno de prueba y carece de radicación oficial.']]){
      const el=ack.createElement(tag);el.textContent=text;ack.body.append(el);
    }
    const url=URL.createObjectURL(new Blob(['<!doctype html>'+ack.documentElement.outerHTML],{type:'text/html;charset=utf-8'}));
    const link=make('a');link.href=url;link.download='constancia-del-piloto.html';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }));
  function renderDecisions(result){
    documents=result;
    decisionsArea.replaceChildren(make('legend','Decisiones para esta solicitud de prueba'));
    decisionsArea.hidden=false;
    const oldConsent=oldDecisions[0];
    if(oldConsent){oldConsent.hidden=true;oldConsent.querySelector('input').required=false;}
    for(const doc of documents){
      if(doc.act==='electronic_notice'){
        const choice=make('fieldset',null,'portal-decisions');
        choice.append(make('legend',doc.title),make('p',doc.body));
        for(const [value,text] of [['granted','Sí, autorizo los avisos por correo'],['declined','No autorizo los avisos por correo']]){
          const option=make('input'), label=make('label',null,'check');
          option.type='radio';option.name='decision-electronic_notice';option.value=value;
          label.append(option,make('span',text));choice.append(label);
        }
        decisionsArea.append(choice);continue;
      }
      const label=make('label',null,'check'), box=make('input'), info=make('span');
      box.type='checkbox';box.name='decision-'+doc.act;box.required=doc.required;
      info.append(make('strong',doc.title),make('span',doc.body,'plain-content'));
      label.append(box,info);decisionsArea.append(label);
    }
  }
  function clearDecisions(){
    documents=[];decisionsArea.replaceChildren();decisionsArea.hidden=true;
    if(oldDecisions[0]){oldDecisions[0].hidden=false;oldDecisions[0].querySelector('input').required=true;}
  }
  render();
  const experience={
    toast:showToast,loading,
    connection(state){
      const area=byId('authCitizen');
      area.querySelector('.portal-connection')?.remove();
      if(state==='ready')return;
      const indicator=make('div',null,'portal-connection');
      if(state==='loading')loading(indicator);
      else indicator.append(button('Reintentar conexión',()=>location.reload()));
      area.append(indicator);
    },
    view(view){
      selectedView=view;
      context.textContent='Portal de Salud / '+({citizen:'Solicitud ciudadana',catalog:'Catálogo de trámites',service:'Información del servicio',tracking:'Mis solicitudes',admin:'Gestión de Salud',communications:'Avisos',legal:'Centro legal'}[view]??'Portada');
      if(view==='legal')void loadAccount();
      if(!['citizen','catalog'].includes(view)&&dialog.open)dialog.close();
      if(['citizen','catalog'].includes(view))render(true);
    },
    async publicEndpoint(endpoint,useSupabase){
      publicEndpoint=endpoint;
      try{
        const response=await fetch(endpoint+'?content=public'+(useSupabase?'&probe=sits-supabase-v1':''),{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(6000)});
        const body=await response.json();
        if(response.ok&&body.ok&&Array.isArray(body.notices)&&Array.isArray(body.policies)){publicContent=body;render(true);}
      }catch{}
    },
    setSession(user,role,enabled=false){
      if(session!==user){rightsKey=null;manager.hidden=true;clearDecisions();}
      session=user;privateContent=null;capability=enabled;
      adminNav.hidden=!demo&&!['operator','admin','supervisor'].includes(role);
      for(const b of adminMenu.querySelectorAll('button')){
        if(['Avisos','Políticas','Solicitudes de titulares'].includes(b.textContent))b.hidden=!demo&&!['admin','supervisor'].includes(role);
      }
      if(!user){if(dialog.open)dialog.close();accountRegion.replaceChildren();render();}
      else void refreshPrivate().then(()=>{if(selectedView==='legal'&&session===user)void loadAccount();});
    },
    async prepare(user){
      if(demo)return;
      try{
        const result=await invoke('institutionalForm');
        if(session===user)renderDecisions(result.documents);
      }catch(e){
        if(capability)throw e;
      }
    },
    decisions(){
      return documents.map(doc=>{
        const choice=decisionsArea.querySelector('[name="decision-'+doc.act+'"]:checked');
        const decision=doc.act==='notice'?'acknowledged':doc.act==='terms'?'accepted':choice?.value||'unselected';
        return {id:doc.id,act:doc.act,version:doc.version,hash:doc.hash,decision};
      });
    }
  };
  return experience;
}
