import {normalizeSearch, filterServices, categoryCounts, categoryCode} from './catalog-domain.mjs';
import {selectAdminServices,selectServiceCases} from './admin-collections.mjs';
import {readStudioDraft,writeStudioDraft,clearStudioDraft} from './studio-draft.mjs';
import {inspectConfiguredIntake} from './configured-intake-contract.mjs';

const node=(tag,text,cls)=>{
 const element=document.createElement(tag);
 if(text!=null)element.textContent=text;
 if(cls)element.className=cls;
 return element;
};
const btn=(text,fn,kind='secondary')=>{
 const button=node('button',text,kind);
 button.type='button';button.onclick=fn;return button;
};
const selectOptions=(input,options)=>{
 for(const [value,name] of Object.entries(options)){
  const option=node('option',name);option.value=value;input.append(option);
 }
};
function field(parent,label,name,value='',config={}){
 const text=node('label'), caption=node('span',label);
 const input=node(config.options?'select':config.multi?'textarea':'input');
 if(config.options)selectOptions(input,config.options);
 else if(!config.multi)input.type=config.type||'text';
 input.name=name;
 input.setAttribute('aria-label',label);
 if(config.required)input.required=true;
 if(config.multi)input.rows=config.rows||3;
 if(config.max)input.maxLength=config.max;
 input.value=value;
 text.append(caption,input);parent.append(text);
 return input;
}
function region(title,desc){
 const area=node('section',null,'view hidden module-panel');
 const heading=node('h1',title);heading.tabIndex=-1;
 area.append(heading,node('p',desc,'module-intro'));return area;
}
function errorRegion(){
 const error=node('p',null,'error');
 error.setAttribute('role','alert');return error;
}
function submit(form,label,fn){
 const button=node('button',label,'primary'),error=errorRegion();
 button.type='submit';form.append(button,error);
 form.onsubmit=async event=>{
  event.preventDefault();button.disabled=true;form.setAttribute('aria-busy','true');error.textContent='';
  try{await fn(Object.fromEntries(new FormData(form)));}
  catch(e){
   const detail={
    recent_login_required:'Tu cuenta necesita una nueva verificación con Google para guardar. Sal del portal e inicia sesión nuevamente con tu cuenta institucional; después vuelve a esta sección.',
    forbidden:'Tu cuenta no dispone de permiso para crear o modificar este contenido. Solicita acceso de administración.',
    rate_limit:'Se alcanzó el límite de registros permitidos. Solicita apoyo al administrador.',
    content_version_changed:'El registro fue actualizado por otra persona. Actualiza la pantalla antes de guardar.',
    invalid_request:'Revisa los campos obligatorios, los códigos y la categoría seleccionada.'
   };
   error.textContent=detail[e?.code]||detail[e?.message]||e?.message||'No se pudo guardar. Vuelve a intentarlo.';
  }
  finally{button.disabled=false;form.removeAttribute('aria-busy');}
 };
}
const standard={id:'discapacidad',title:'Certificación de discapacidad',category:'discapacidad-apoyos',
 description:'Orientación, solicitud y seguimiento de soportes para la certificación de discapacidad.',channel:'Secretaría de Salud',standard:true};
const normalize=normalizeSearch;
const icons={folder:'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',document:'M6 3h8l4 4v14H6z M14 3v5h5 M9 12h6 M9 16h6',heart:'M20.8 8.6c0 4-8.8 10-8.8 10s-8.8-6-8.8-10a4.6 4.6 0 0 1 8.8-2 4.6 4.6 0 0 1 8.8 2z M7 12h3l1-2 2 4 1-2h3',search:'M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13z M16 16l4 4',clock:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2',help:'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M9 9a3 3 0 1 1 4 3v1 M12 17h.01',shield:'M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10z M8 12l3 3 5-6',arrow:'M5 12h14 M13 6l6 6-6 6',grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',list:'M8 5h13 M8 12h13 M8 19h13 M3 5h.01 M3 12h.01 M3 19h.01'};
function glyph(name,cls='service-glyph'){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('class',cls);
 const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',icons[name]||icons.document);path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.65');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;
}
const fixtureNames={historia:'Soporte principal',apoyo:'Anexo'};
const fieldNames={text:'Texto corto',textarea:'Texto amplio',number:'Número',date:'Fecha',select:'Lista',
 radio:'Opción única',checkbox:'Casilla',document:'Documento PDF'};
const caseStates={saving:'Archivando soportes',storage_review:'Archivo por verificar',received:'Recibida',closed:'Cerrada'};

export function serviceCatalog({demo,navigate,invoke,experience,fixtureData,downloadContent,startConfiguredService,startOfficialService}){
 const catalogue=region('Trámites y servicios de Salud','Encuentra orientación, consulta los requisitos y realiza el seguimiento de tus solicitudes en un solo lugar.');
 catalogue.id='catalog';catalogue.classList.add('catalog-home');
 const service=region('Ficha de trámite','Consulte los requisitos antes de continuar.');
 service.id='service';
 const main=document.getElementById('main');
 const nav=document.querySelector('.nav');
 main.append(catalogue,service);
 const masthead=node('div',null,'catalog-masthead'),copy=node('div');
 copy.append(node('div','ALCALDÍA DE SAN PEDRO · SERVICIOS DIGITALES','catalog-kicker'),catalogue.querySelector('h1'),catalogue.querySelector('.module-intro'));
 masthead.append(copy);catalogue.append(masthead);
 const heroActions=node('div',null,'hero-actions');
 const explore=btn('Explorar trámites',()=>{search.focus();search.scrollIntoView({block:'center'});},'primary hero-cta');explore.dataset.voiceHint='Explorar trámites. Abre el buscador de servicios.';
 const follow=btn('Consultar solicitudes',()=>navigate('tracking'),'secondary hero-secondary');follow.dataset.voiceHint='Consultar solicitudes. Accede al seguimiento protegido.';
 heroActions.append(explore,follow);copy.append(heroActions);
 const quick=node('div',null,'citizen-quick');
 for(const [icon,title,desc,action] of [
  ['search','Encuentra un trámite','Explora el catálogo por categoría.',()=>{search.focus();search.scrollIntoView({block:'center'});}],
  ['clock','Mis solicitudes','Consulta el avance de tus solicitudes.',()=>navigate('tracking')],
  ['help','¿Necesitas ayuda?','Conoce cómo usar el portal.',()=>showHelp()]
 ]){
  const tile=btn('',action,'quick-tile'),ico=node('span',null,'quick-glyph');ico.append(glyph(icon));
  const words=node('span');words.append(node('strong',title),node('small',desc));tile.append(ico,words,glyph('arrow','quick-arrow'));tile.dataset.voiceHint=title+'. '+desc;quick.append(tile);
 }
 catalogue.append(quick);if(document.getElementById('home'))quick.classList.add('catalog-context-tools');
 const searchBar=node('div',null,'catalog-filters');
 const search=field(searchBar,'Buscar trámite','search');
 const category=field(searchBar,'Categoría','category','',{options:{'':'Todas'}});
 const filters=node('div',null,'catalog-tools');filters.append(searchBar);catalogue.insertBefore(filters,quick);search.placeholder='Ej. discapacidad, certificación…';
 const folderRegion=node('section',null,'folder-region');folderRegion.append(node('h2','Explora por categoría'));const folders=node('div',null,'folder-grid');folderRegion.append(folders);catalogue.append(folderRegion);
 const list=node('div',null,'document-grid');
 const catalogInfo=node('p',null,'module-intro');catalogInfo.setAttribute('role','status');
 const infoRow=node('div',null,'catalog-info-row'),infoText=node('div');infoText.append(node('h2','Servicios disponibles'),catalogInfo);
 const controls=node('div',null,'catalog-view-controls'),clear=btn('Limpiar filtros',()=>{search.value='';category.value='';renderCatalog();},'quiet');
 const cards=btn('',()=>setLayout('cards'),'quiet'),rows=btn('',()=>setLayout('rows'),'quiet');
 cards.setAttribute('aria-label','Vista de tarjetas');rows.setAttribute('aria-label','Vista de lista');cards.append(glyph('grid'));rows.append(glyph('list'));controls.append(clear,cards,rows);
 infoRow.append(infoText,controls);catalogue.append(infoRow,list);
 function setLayout(layout){list.classList.toggle('catalog-list-view',layout==='rows');cards.setAttribute('aria-pressed',String(layout==='cards'));rows.setAttribute('aria-pressed',String(layout==='rows'));}
 setLayout('cards');
 const assistance=node('section',null,'citizen-assistance');const assistCopy=node('div');assistCopy.append(node('h2','Estamos para orientarte'),node('p','Si tienes dudas sobre los requisitos o necesitas atención presencial, consulta los canales de la Alcaldía.'));
 const official=node('a','Consultar canales oficiales','secondary help-link');official.href='https://www.sanpedro-valle.gov.co/';assistance.append(assistCopy,official);catalogue.append(assistance);assistance.hidden=!!document.getElementById('home');
 const faq=node('section',null,'citizen-faq');faq.append(node('h2','Preguntas frecuentes'),node('p','Encuentra respuestas antes de iniciar.','module-intro'));for(const [q,a] of [['¿Necesito iniciar sesión para consultar los trámites?','No. El catálogo, las fichas y la preparación de requisitos están disponibles sin cuenta.'],['¿Cómo consulto el estado de una solicitud?','En Mis solicitudes, inicia sesión con el correo asociado a tu expediente.'],['¿Dónde puedo recibir atención si necesito apoyo?','Consulta los canales oficiales de la Alcaldía y de la Secretaría de Salud.'],['¿Cómo activo la guía por voz?','Selecciona Escuchar guía. Navega con el mouse o con Tab; puedes pausar o desactivar la lectura en cualquier momento.']]){const detail=node('details',null,'faq-item'),summary=node('summary',q);summary.dataset.voiceHint=q;const answer=node('p',a);answer.dataset.voiceHint=a;detail.append(summary,answer);faq.append(detail);}catalogue.append(faq);
 const guide=node('dialog',null,'institution-dialog citizen-guide');guide.setAttribute('aria-labelledby','citizen-guide-title');
 const guideTitle=node('h2','Cómo utilizar SITS Salud');guideTitle.id='citizen-guide-title';const guideClose=btn('Cerrar',()=>guide.close());
 const guideList=node('ol',null,'help-steps');for(const [title,body] of [['Encuentra el servicio','Utiliza el buscador o selecciona una categoría.'],['Consulta la información','Revisa los requisitos y el canal de atención.'],['Identifícate','Cuando corresponda, utiliza tu cuenta autorizada.'],['Haz seguimiento','En Mis solicitudes podrás consultar tus actuaciones disponibles.']]){const li=node('li');li.append(node('strong',title),node('p',body));guideList.append(li);}
 guide.append(guideTitle,guideList,node('p','La radicación electrónica oficial se habilitará cuando la entidad complete su validación. Por ahora, consulta la información y los canales autorizados.','module-intro'),guideClose);document.body.append(guide);
 function showPreparation(item){
  const dialog=node('dialog',null,'institution-dialog guest-preparation');dialog.setAttribute('aria-labelledby','guest-preparation-title');
  const title=node('h2','Prepara tu solicitud');title.id='guest-preparation-title';const intro=node('p','Revisa esta lista sin iniciar sesión ni ingresar datos personales. No se enviará una solicitud ni se generará un radicado.');dialog.append(title,intro);
  for(const line of ['Consultar los requisitos en la Secretaría de Salud.','Identificar el canal oficial de atención.','Organizar los documentos sin cargarlos al portal.']){const label=node('label',null,'check'),box=node('input');box.type='checkbox';label.append(box,node('span',line));dialog.append(label);}
  const detail=node('p','El seguimiento de una solicitud registrada requiere la cuenta asociada. Si no tienes correo, consulta la alternativa de atención municipal.','module-intro');
  const focus=document.activeElement;const close=btn('Cerrar',()=>dialog.close());dialog.append(detail,close);document.body.append(dialog);dialog.addEventListener('close',()=>{dialog.remove();if(focus?.isConnected)focus.focus();});dialog.showModal();close.focus();
 }
 let guideFocus;function showHelp(){if(document.querySelector('dialog[open]'))return;guideFocus=document.activeElement;guide.showModal();guideClose.focus();}
 guide.addEventListener('close',()=>{if(guideFocus?.isConnected)guideFocus.focus();});

 const serviceBody=node('div');
 service.append(serviceBody);
 let publicCatalog={items:[standard],categories:[{id:'discapacidad-apoyos',title:'Discapacidad y apoyos'}]};
 let endpoint,activeService,user,role,serviceKey,cacheError,pendingService,officialActive=null,availabilityText='Consulta la disponibilidad al iniciar';
 // The same published catalogue powers home and full catalogue.
 // The detail and action routes remain centralized in openService.
 const homeSearch=document.getElementById('homeServiceSearch');
 const homeCategory=document.getElementById('homeServiceCategory');
 const homeStatus=document.getElementById('homeCatalogStatus');
 const homeCards=document.getElementById('homeCatalogCards');
 function renderHomeCatalog(){
  if(!homeSearch||!homeCategory||!homeStatus||!homeCards)return;
  const options=categoryCounts(publicCatalog);
  const signature=JSON.stringify(options.map(x=>[x.id,x.title]));
  if(homeCategory.dataset.catalogOptions!==signature){
   const selected=homeCategory.value;
   homeCategory.replaceChildren();
   selectOptions(homeCategory,Object.fromEntries(options.map(x=>[x.id,x.title])));
   homeCategory.value=options.some(x=>x.id===selected)?selected:'';
   homeCategory.dataset.catalogOptions=signature;
  }
  const matches=filterServices(publicCatalog,{query:homeSearch.value,category:homeCategory.value});
  homeStatus.textContent=cacheError
   ?'La consulta del catálogo está limitada temporalmente. Verifique la disponibilidad antes de iniciar.'
   :matches.length+' '+(matches.length===1?'trámite encontrado':'trámites encontrados')+(matches.length>6?' · mostrando los primeros seis':'');
  homeCards.replaceChildren();
  if(!matches.length){
   const empty=node('div',null,'home-catalog-empty');
   empty.append(node('h3','No encontramos ese trámite'),node('p','Pruebe con otra palabra o consulte todas las categorías.'));
   empty.append(btn('Limpiar búsqueda',()=>{homeSearch.value='';homeCategory.value='';renderHomeCatalog();homeSearch.focus();},'secondary'));
   homeCards.append(empty);return;
  }
  for(const item of matches.slice(0,6)){
   const card=node('article',null,'home-catalog-card');
   card.dataset.service=item.standard?'official':'configured';
   const categoryName=publicCatalog.categories.find(x=>x.id===item.category)?.title||'Salud';
   const tag=node('span',categoryName,'home-catalog-category');
   const identity=node('div',null,'home-catalog-identity');
   const mark=node('span',null,'home-catalog-icon');
   mark.setAttribute('aria-hidden','true');
   mark.append(glyph(item.standard?'heart':'document'));
   identity.append(mark,tag);
   const heading=node('h3',item.title),summary=node('p',item.description,'home-catalog-description');
   const availability=node('p',item.standard
    ?officialActive===true?'Recepción electrónica disponible':officialActive===false?'Atención según disponibilidad':'Consulte los requisitos y la disponibilidad'
    :'Consulte la ficha y el canal autorizado','home-catalog-availability');
   const actions=node('div',null,'home-catalog-actions');
   actions.append(btn('Ver requisitos',()=>void openService(item),'primary'));
   if(item.standard&&officialActive===true)actions.append(btn('Iniciar solicitud',()=>{if(startOfficialService)startOfficialService();else navigate('citizen');},'secondary'));
   if(!item.standard&&item.intakeEnabled&&item.intakeSchema&&startConfiguredService)
    actions.append(btn('Iniciar solicitud',()=>startConfiguredService(item),'secondary'));
   card.append(identity,heading,summary,availability,actions);
   homeCards.append(card);
  }
 }
 homeSearch?.addEventListener('input',renderHomeCatalog);
 homeCategory?.addEventListener('change',renderHomeCatalog);
 document.getElementById('homeServiceForm')?.addEventListener('submit',event=>{
  event.preventDefault();renderHomeCatalog();
  document.getElementById('home-catalog-heading')?.scrollIntoView({block:'start',behavior:'smooth'});
  homeStatus.tabIndex=-1;homeStatus.focus({preventScroll:true});
 });
 const menu=document.querySelector('.admin-module-menu');
 const manager=node('section',null,'module-panel catalog-manager');
 manager.hidden=true;
 const dashboard=document.getElementById('adminDashboard');
 dashboard.append(manager);
 if(!demo){
  if(!nav.querySelector('[data-view=catalog]')){
   const tab=btn('Trámites y servicios',()=>navigate('catalog'),'navbtn');tab.dataset.view='catalog';nav.prepend(tab);
  }
  menu.append(btn('Catálogo y formularios',()=>void openAdmin('catalog')),
   btn('Expedientes de servicios',()=>void openAdmin('cases')),btn('Accesos del personal',()=>void openAdmin('staff')));
  menu.addEventListener('click',e=>{
   if(e.target.closest('button')&&!['Catálogo y formularios','Expedientes de servicios','Accesos del personal'].includes(e.target.textContent)){
    manager.hidden=true;
   }
  });
 }
 const links=btn('Consultar catálogo',()=>navigate('catalog'));
 serviceBody.before(links);
 function renderCatalog(){
  list.replaceChildren();
  const text=normalize(search.value);
  const chosen=category.value;
  const matched=filterServices(publicCatalog,{query:search.value,category:chosen});
  folders.replaceChildren();
  for(const item of categoryCounts(publicCatalog)){
   const count=item.count;
   const folder=btn('',()=>{category.value=item.id;renderCatalog();},'service-folder');
   folder.setAttribute('aria-pressed',String(chosen===item.id));folder.dataset.voiceHint='Categoría '+item.title+'. '+count+' servicio'+(count===1?'':'s')+'.';const ico=node('span',null,'folder-glyph');ico.append(glyph('folder'));
   const words=node('span');words.append(node('strong',item.title),node('small',count+' '+(count===1?'servicio':'servicios')));folder.append(ico,words);folders.append(folder);
  }
  clear.disabled=!text&&!chosen;
  catalogInfo.textContent=cacheError?'Consulta de catálogo limitada temporalmente.':'Trámites disponibles: '+matched.length;
  if(!matched.length){const empty=node('div',null,'module-panel catalog-empty');empty.append(glyph('search'),node('h3','No encontramos coincidencias'),node('p','Prueba otro término o consulta todas las categorías.'),btn('Ver todos',()=>{search.value='';category.value='';renderCatalog();}));list.append(empty);}
  for(const item of matched){
   const card=node('article',null,'module-panel catalog-card');
   const tag=publicCatalog.categories.find(x=>x.id===item.category)?.title;
   const top=node('div',null,'catalog-card-top'),icon=node('span',null,'catalog-icon');icon.append(glyph(item.standard?'heart':'document'));top.append(icon);
   if(tag)top.append(node('span',tag,'doc-status'));
   const meta=node('p',item.standard?'Certificación · Secretaría de Salud':'Servicios configurados · Secretaría de Salud','catalog-card-meta');const title=node('h2',item.title),description=node('p',item.description,'plain-content'),action=btn('Ver requisitos y pasos',()=>void openService(item),'primary');title.dataset.voiceHint=item.title;description.dataset.voiceHint=item.description;action.dataset.voiceHint='Ver trámite. '+item.title;card.dataset.voiceHint=item.title+'. '+item.description;card.append(top,title,description,meta,action);
   list.append(card);
  }
  renderHomeCatalog();
 }
 search.oninput=renderCatalog;
 category.onchange=renderCatalog;
 async function connect(url){
  endpoint=url;
  try{
   const response=await fetch(url+'?content=catalog&probe=sits-supabase-v1',{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(7000)});
   const data=await response.json();
   if(!response.ok||!Array.isArray(data.items)||!Array.isArray(data.categories))throw Error('Catálogo no disponible.');
   publicCatalog=data;cacheError=false;
   const previous=category.value;
   category.replaceChildren();selectOptions(category,Object.fromEntries([['','Todas'],...data.categories.map(x=>[x.id,x.title])]));
   category.value=data.categories.some(x=>x.id===previous)?previous:'';
  }catch{cacheError=true;}
  renderCatalog();
 }
 function dynamicFields(form,fields,{preview=false}={}){
  const inputs=new Map(),files=new Map();
  for(const spec of fields){
   const wrap=node('div');
   form.append(wrap);
   if(spec.type==='checkbox'){
    const label=node('label',null,'check'),box=node('input');
    box.type='checkbox';box.name=spec.id;box.required=spec.required;
    label.append(box,node('span',spec.label));wrap.append(label);inputs.set(spec.id,{element:box,wrap,spec});continue;
   }
   if(spec.type==='radio'){
    const group=node('fieldset',null,'portal-decisions');
    group.append(node('legend',spec.label));
    const controls=[];
    for(const value of spec.options){
     const label=node('label',null,'check'),input=node('input');
     input.type='radio';input.name=spec.id;input.value=value;input.required=spec.required;
     label.append(input,node('span',value));group.append(label);controls.push(input);
    }
    wrap.append(group);inputs.set(spec.id,{element:controls[0],controls,wrap,spec});continue;
   }
   if(spec.type==='document'){
    const status=node('p','Sin PDF adjunto','doc-status');
    status.setAttribute('role','status');
    const attach=btn('Adjuntar '+fixtureNames[spec.fixture].toLowerCase()+' de prueba',async()=>{
     attach.disabled=true;
     try{if(!preview)files.set(spec.id,await fixtureData(spec.fixture));status.textContent='PDF de prueba adjuntado.';}
     catch(e){status.textContent=e.message;}finally{attach.disabled=false;}
    });
    wrap.append(node('p',spec.label+(spec.required?' (obligatorio)':'')),attach,status);
    inputs.set(spec.id,{element:attach,wrap,spec});continue;
   }
   const isList=spec.type==='select';
   const element=field(wrap,spec.label,spec.id,isList?'':spec.fixture??'',{
    type:['number','date'].includes(spec.type)?spec.type:'text',multi:spec.type==='textarea',required:spec.required,
    options:isList?Object.fromEntries([['','Seleccione'],...spec.options.map(x=>[x,x])]):null
   });
   if(!isList)element.readOnly=true;
   inputs.set(spec.id,{element,wrap,spec});
  }
  const value=({element,controls,spec})=>controls?controls.find(x=>x.checked)?.value??'':spec.type==='checkbox'?element.checked:
   spec.type==='number'?Number(element.value):element.value;
  function update(){
   for(const {element,controls,wrap,spec} of inputs.values()){
    const source=inputs.get(spec.condition?.field);
    wrap.hidden=!!source&&(source.wrap.hidden||value(source)!==spec.condition.equals);
    for(const target of controls||[element])target.disabled=wrap.hidden;
   }
  }
  form.addEventListener('change',update);update();
  return ()=>{
   const answers={};
   for(const [id,entry] of inputs){
    if(entry.wrap.hidden)continue;
    if(entry.spec.type==='document'){
     if(files.has(id))answers[id]=files.get(id);
     else if(entry.spec.required)throw Error('Adjunte el PDF de prueba para '+entry.spec.label+'.');
    }else if(value(entry)!=='')answers[id]=value(entry);
   }
   return answers;
  };
 }
 function formDecisions(form,documents){
  const group=node('fieldset',null,'portal-decisions');group.append(node('legend','Decisiones sobre esta solicitud de prueba'));
  for(const doc of documents){
   if(doc.act==='electronic_notice'){
    const choice=node('fieldset',null,'portal-decisions');choice.append(node('legend',doc.title),node('p',doc.body));
    for(const [value,text] of [['granted','Sí, autorizo el correo'],['declined','No autorizo el correo']]){
     const radio=node('input'),label=node('label',null,'check');
     radio.type='radio';radio.name=doc.act;radio.value=value;label.append(radio,node('span',text));choice.append(label);
    }
    group.append(choice);continue;
   }
   const label=node('label',null,'check'), box=node('input'), words=node('span');
   box.type='checkbox';box.required=doc.required;box.name=doc.act;
   words.append(node('strong',doc.title),node('span',doc.body,'plain-content'));
   label.append(box,words);group.append(label);
  }
  form.append(group);
  return ()=>documents.map(doc=>({id:doc.id,version:doc.version,hash:doc.hash,act:doc.act,
   decision:doc.act==='notice'?'acknowledged':doc.act==='terms'?'accepted':group.querySelector('[name=electronic_notice]:checked')?.value||'unselected'}));
 }
 async function openService(item){
  activeService=item;serviceKey=null;
  service.querySelector('h1').textContent=item.title;service.querySelector('h1').dataset.voiceHint=item.title;
  const description=node('div',null,'service-overview');description.append(node('h2','Sobre este servicio'),node('p',item.description,'plain-content'),node('p','Canal de atención: '+(item.channel||'Secretaría de Salud')));
  const status=node('div',null,'service-availability');status.append(glyph('shield'),node('p',availabilityText));
  serviceBody.replaceChildren(description,status);
  navigate('service');
  if(item.standard){
   const requirements=node('section',null,'service-overview');
   requirements.append(node('h2','Quién puede solicitarlo'),node('p','La persona que requiere una valoración puede presentar la solicitud. Cuando corresponda, puede contar con una persona de apoyo.'));
   requirements.append(node('h2','Documentos para preparar'));
   const items=node('ul');
   for(const text of ['Información de identificación y contacto de la persona solicitante.','Historia clínica o soporte del médico tratante, en PDF, para la revisión de Salud.','Soporte adicional cuando Salud lo requiera para el caso.'])items.append(node('li',text));
   requirements.append(items,node('p','La Secretaría de Salud orienta los requisitos y la valoración. Consulta las condiciones del procedimiento antes de trasladarte.'));
   const terms=node('a','Procedimiento de certificación · Ministerio de Salud','secondary help-link');
   terms.href='https://www.minsalud.gov.co/sites/rid/Lists/BibliotecaDigital/RIDE/DE/DIJ/resolucion-1197-de-2024.pdf';
   requirements.append(terms,btn('Preparar requisitos sin iniciar sesión',()=>showPreparation(item),'secondary'),btn(officialActive===true?'Iniciar solicitud':officialActive===false?'Consultar canales de atención':'Consultar disponibilidad',()=>{if(officialActive===false)navigate('help');else if(startOfficialService)startOfficialService();else navigate('citizen');},'primary'));
   const next=node('section',null,'service-overview');
   next.append(node('h2','Después de enviar'),node('p','Conserva la referencia para consultar la verificación de los documentos y las acciones pendientes. La valoración y el certificado corresponden al proceso autorizado.'),btn('Consultar mis solicitudes',()=>navigate('tracking'),'secondary'));
   serviceBody.append(requirements,next);return;
  }
  // A published configurable service is a public information page, not
  // evidence that its synthetic intake workflow is approved for citizens.
  const publicInfo=node('section',null,'service-overview');
  publicInfo.append(node('h2','Cómo solicitar este servicio'),
   node('p','Consulte la información del trámite y comuníquese con la Secretaría de Salud para confirmar requisitos, disponibilidad y forma de atención.'),
   node('p','Canal autorizado: '+(item.channel||'Secretaría de Salud')));
  serviceBody.append(publicInfo);
  if(item.intakeEnabled&&item.intakeSchema&&startConfiguredService){
   serviceBody.append(node('p','Este servicio tiene recepción electrónica autorizada. Sigue los cinco pasos de SITS Salud.','ui-service-status'));
   serviceBody.append(btn('Iniciar solicitud de '+item.title,()=>startConfiguredService(item),'primary'));
   return;
  }
  if(!user||!['supervisor','admin','operator'].includes(role)){
   serviceBody.append(btn('Consultar ayuda y canales de atención',()=>navigate('help'),'primary'));
   return;
  }
  serviceBody.append(node('p','Prueba institucional: utilice exclusivamente información y archivos ficticios.','studio-safety'));
  const load=node('div');serviceBody.append(load);experience.loading(load);
  try{
   const [schema,legal]=await Promise.all([invoke('serviceRead',{id:item.id}),invoke('institutionalForm')]);
   if(activeService!==item||!user)return;
   load.replaceChildren();
   const form=node('form',null,'compact-form');
   load.append(node('h2','Solicitud'),node('p','Modo de prueba institucional. Use exclusivamente las opciones y archivos ficticios.'),form);
   const values=dynamicFields(form,schema.fields);
   const decisions=formDecisions(form,legal.documents);
   const acknowledge=node('label',null,'check'),box=node('input');box.type='checkbox';box.required=true;
   acknowledge.append(box,node('span','Confirmo que esta solicitud utiliza únicamente datos ficticios.'));form.append(acknowledge);
   submit(form,'Registrar solicitud',async()=>{
    serviceKey??=crypto.randomUUID();
    const result=await invoke('serviceApply',{id:item.id,version:schema.version,answers:values(),legalDecisions:decisions(),synthetic:true,key:serviceKey});
    serviceKey=null;
    load.replaceChildren(node('h2','Constancia de prueba'),node('p',result.radicado),node('p',caseStates[result.status]||result.status),
     btn('Consultar mis solicitudes',()=>navigate('tracking')));
    experience.toast('Solicitud de prueba registrada.');
   });
  }catch(e){load.replaceChildren(node('p',e.message,'error'),btn('Reintentar',()=>void openService(item)));}
 }
 const operations=async(fn,refresh)=>{await fn();experience.toast('Cambios registrados.');await refresh();};
 function action(text,fn){
  const button=btn(text,async()=>{
   button.disabled=true;const error=errorRegion();button.after(error);
   try{await fn();}catch(e){error.textContent=e.message;}finally{button.disabled=false;}
  });
  return button;
 }
 const lines=value=>value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean);
 function editService(current,data){
  const draft=current?.draft||{fields:[],states:[{id:'received',label:'Recibida',next:['reviewing']},{id:'reviewing',label:'En revisión',next:['closed']},{id:'closed',label:'Cerrada',next:[]}],operators:[]};
  const slug=value=>normalize(value).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,38);
  const unique=(value,used)=>{let base=/^[a-z]/.test(value)?value:'campo-'+value;base=base.slice(0,34)||'campo';if(base.length<2)base+='-1';let id=base,i=2;while(used.includes(id))id=base+'-'+i++;return id;};
  manager.replaceChildren();
  const heading=node('div',null,'studio-heading');const about=node('div');about.append(node('span','CREACIÓN GUIADA DE TRÁMITES','studio-kicker'),node('h2',current?'Editar borrador':'Nuevo trámite'),node('p','Configure la información, organice las preguntas y revise el formulario antes de guardar.','module-intro'));heading.append(about,btn('Volver al catálogo',()=>void openAdmin('catalog')));
  const journey=node('ol',null,'studio-journey');
  for(const label of ['Información del servicio','Preguntas y documentos','Revisión, responsables y publicación'])journey.append(node('li',label));
  const guidance=node('p','El borrador no se publica automáticamente. Los nuevos trámites utilizan el circuito de pruebas hasta que Salud autorice su funcionamiento operativo.','studio-safety');
  manager.append(heading,journey,guidance);
  const form=node('form',null,'compact-form studio-form');
  // Avoid collisions between repeated nested field ids and the service's id.
  const general=node('section',null,'studio-section');general.append(node('h3','1. Información del trámite'));
  const title=field(general,'Nombre del trámite','title',draft.title||'',{required:true,max:120});
  const id=field(general,'Código del trámite','serviceId',current?.id||'',{required:true});id.readOnly=!!current;id.pattern='[a-z][a-z0-9-]{1,39}';
  let idManual=!!current;id.addEventListener('input',()=>{idManual=true});
  title.addEventListener('input',()=>{if(!idManual){const value=slug(title.value);id.value=value?unique(value,data.services.map(x=>x.id)):'';}});
  const description=field(general,'Descripción','description',draft.description||'',{required:true,multi:true,max:1800});
  const activeCategories=data.categories.filter(x=>x.active).sort((a,b)=>a.title.localeCompare(b.title,'es-CO'));
  const category=field(general,'Categoría del trámite','category',draft.category||'',{
   required:true,options:Object.fromEntries([['','Selecciona una categoría de salud'],...activeCategories.map(x=>[x.id,x.title])])
  });
  const categoryHelp=node('p','Selecciona el área de salud a la que pertenece este trámite. Si no aparece, créala aquí sin perder la información del formulario.','studio-category-help');
  const createCategory=node('details',null,'studio-category-create');
  const createHeading=node('summary','¿No aparece la categoría? Crear una nueva');
  createCategory.append(createHeading);
  const categoryEditor=node('div',null,'studio-category-editor');
  const newCategoryName=field(categoryEditor,'Nombre de la nueva categoría','newCategoryName','',{max:70});
  const newCategoryCode=field(categoryEditor,'Código automático de categoría','newCategoryCode','',{max:40});
  let categoryCodeManual=false;
  newCategoryCode.addEventListener('input',()=>{categoryCodeManual=true;});
  newCategoryName.addEventListener('input',()=>{
   if(!categoryCodeManual)newCategoryCode.value=categoryCode(newCategoryName.value,data.categories.map(x=>x.id));
  });
  const categoryError=errorRegion();
  const saveNewCategory=btn('Guardar y seleccionar categoría',async()=>{
   const name=newCategoryName.value.trim();
   if(!name){categoryError.textContent='Escribe el nombre de la categoría.';newCategoryName.focus();return;}
   const code=newCategoryCode.value.trim();
   if(!/^[a-z][a-z0-9-]{1,39}$/.test(code)){categoryError.textContent='El código debe tener de 2 a 40 caracteres, comenzar con letra y utilizar minúsculas, números o guiones.';newCategoryCode.focus();return;}
   if(data.categories.some(x=>x.id===code)){categoryError.textContent='Ya existe una categoría con ese código. Selecciona la existente o cambia el nombre.';return;}
   saveNewCategory.disabled=true;categoryError.textContent='';
   try{
    await invoke('categorySave',{id:code,title:name});
    data.categories.push({id:code,title:name,active:true});
    const option=node('option',name);option.value=code;category.append(option);category.value=code;
    newCategoryName.value='';newCategoryCode.value='';categoryCodeManual=false;createCategory.open=false;
    experience.toast('Categoría creada y seleccionada. Puedes continuar diseñando el trámite.');
    category.focus();
   }catch(e){
    categoryError.textContent=e?.code==='recent_login_required'
     ?'Para guardar categorías, vuelve a iniciar sesión con Google y abre nuevamente el constructor.'
     :e?.code==='forbidden'?'Tu cuenta no tiene permisos para crear categorías.'
     :e?.code==='rate_limit'?'Se alcanzó el número máximo de categorías. Contacta al administrador.'
     :e?.message||'No se pudo guardar la categoría.';
   }finally{saveNewCategory.disabled=false;}
  },'primary');
  for(const input of [newCategoryName,newCategoryCode]){
   input.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();saveNewCategory.click();}
   });
  }
  categoryEditor.append(saveNewCategory,categoryError);
  createCategory.append(categoryEditor);
  general.append(categoryHelp,createCategory);
  const channel=field(general,'Canal autorizado','channel',draft.channel||'Secretaría de Salud',{required:true,max:180});
  form.append(general);
  const workspace=node('section',null,'studio-section');const bar=node('div',null,'studio-bar');bar.append(node('h3','2. Constructor de formulario'));const count=node('span','0 campos','state-label');bar.append(count);workspace.append(bar,node('p','Agrega preguntas, marca las obligatorias y ordénalas con las flechas. Los códigos se generan automáticamente.','module-intro'));
  const canvas=node('div',null,'studio-canvas'),palette=node('div',null,'studio-palette'),fields=node('div',null,'builder-group studio-fields');canvas.append(fields,palette);workspace.append(canvas);form.append(workspace);
  const empty=node('div','Agrega tu primera pregunta para comenzar.','studio-empty');empty.setAttribute('role','status');
  function refreshOrder(){const groups=Array.from(fields.children).filter(x=>x!==empty);groups.forEach((group,i)=>{group.querySelector('legend').textContent='Pregunta '+(i+1);group.querySelector('[data-move=up]').disabled=i===0;group.querySelector('[data-move=down]').disabled=i===groups.length-1;});count.textContent=groups.length+' de 16 campos';if(!groups.length){if(!empty.isConnected)fields.append(empty);}else empty.remove();for(const b of palette.querySelectorAll('button'))b.disabled=groups.length>=16;}
  const groups=()=>Array.from(fields.children).filter(x=>x!==empty);
  function addField(spec={},after=null){
   if(groups().length>=16)return;
   const group=node('fieldset',null,'portal-decisions studio-question');group.append(node('legend','Pregunta'));
   const caption=field(group,'Etiqueta del campo','label',spec.label||'',{required:true,max:120});
   const type=field(group,'Tipo de campo','type',spec.type||'text',{options:fieldNames});
   const required=field(group,'Obligatorio','required',spec.required?'yes':'no',{options:{yes:'Sí',no:'No'}});
   const value=field(group,'Valor ficticio o lista de opciones (una por línea)','value',spec.options?.join('\n')??spec.fixture??'',{multi:true});
   const kind=field(group,'PDF de prueba','fixture',spec.type==='document'?spec.fixture:'historia',{options:fixtureNames});
   const advanced=node('details',null,'studio-advanced');advanced.append(node('summary','Configuración avanzada'));
   const code=field(advanced,'Identificador del campo','id',spec.id||unique('campo',groups().map(x=>x.querySelector('[name=id]').value)),{required:true});code.pattern='[a-z][a-z0-9-]{1,39}';
   let manual=!!spec.id;code.addEventListener('input',()=>manual=true);
   caption.addEventListener('input',()=>{if(!manual&&slug(caption.value)){const old=code.value;code.value=unique(slug(caption.value),groups().filter(x=>x!==group).map(x=>x.querySelector('[name=id]').value));for(const other of groups()){const condition=other.querySelector('[name=condition]');if(condition?.value===old)condition.value=code.value;}}});
   const test=field(advanced,'Mostrar si el campo anterior indicado tiene un valor','condition',spec.condition?.field||'');
   const equals=field(advanced,'Valor que activa la condición','equals',spec.condition?.equals||'');
   group.append(advanced);
   function update(){kind.parentElement.hidden=type.value!=='document';value.parentElement.hidden=['checkbox','document'].includes(type.value);value.required=!value.parentElement.hidden;value.disabled=value.parentElement.hidden;kind.disabled=kind.parentElement.hidden;if(type.value==='number'&&!value.value)value.value='0';if(type.value==='date'&&!value.value)value.value='2026-01-01';if(['text','textarea'].includes(type.value)&&!value.value)value.value='Ejemplo de respuesta';}
   type.onchange=update;update();
   const actions=node('div',null,'studio-question-actions');
   const up=btn('↑ Subir',()=>{const prev=group.previousElementSibling;if(prev&&prev!==empty)fields.insertBefore(group,prev);refreshOrder();up.focus();});up.dataset.move='up';
   const down=btn('↓ Bajar',()=>{const next=group.nextElementSibling;if(next)fields.insertBefore(next,group);refreshOrder();down.focus();});down.dataset.move='down';
   const duplicate=btn('Duplicar campo',()=>{const copy=group.value();copy.id=unique(copy.id,groups().map(x=>x.querySelector('[name=id]').value));if(copy.type==='document'){experience.toast('Cada PDF de soporte debe ser único.');return;}addField(copy,group);});
   const remove=btn('Eliminar campo',()=>{group.remove();refreshOrder();palette.querySelector('button')?.focus();});
   actions.append(up,down,duplicate,remove);group.append(actions);
   group.value=()=>{const typeValue=type.value;return {id:code.value,label:caption.value,type:typeValue,required:required.value==='yes',...(['select','radio'].includes(typeValue)?{options:lines(value.value)}:typeValue==='document'?{fixture:kind.value}:typeValue==='number'?{fixture:Number(value.value)}:typeValue==='checkbox'?{}:{fixture:value.value}),...(test.value?{condition:{field:test.value,equals:equals.value}}:{})};};
   empty.remove();if(after)after.after(group);else fields.append(group);refreshOrder();if(!spec.id)caption.focus();
  }
  palette.append(node('h4','Añadir preguntas'));
  palette.append(btn('Añadir campo',()=>addField(),'primary'));
  for(const [type,label] of Object.entries(fieldNames))palette.append(btn('+ '+label,()=>addField({type})));
  draft.fields.forEach(f=>addField(f));refreshOrder();
  const workflow=node('details',null,'studio-section studio-workflow');workflow.append(node('summary','3. Flujo, responsables y mensajes'),node('p','Puedes conservar el flujo predeterminado o personalizarlo.','module-intro'));
  const operators=field(workflow,'UID de operadores autorizados','operators',draft.operators.join('\n'),{multi:true});
  const messages={};for(const [key,label] of [['ack','Mensaje del acuse'],['correction','Mensaje de subsanación'],['closure','Mensaje de cierre']])messages[key]=field(workflow,label+' sin datos personales','message-'+key,draft.messages?.[key]||'',{multi:true,max:500});
  const states=node('div',null,'builder-group');
  function addState(spec={}){const group=node('fieldset',null,'portal-decisions');group.append(node('legend','Etapa del flujo'));const code=field(group,'Código de etapa','stateId',spec.id||'',{required:true});const label=field(group,'Nombre de etapa','stateLabel',spec.label||'',{required:true});const next=field(group,'Códigos de las siguientes etapas','next',(spec.next||[]).join(', '));group.append(btn('Eliminar etapa',()=>group.remove()));group.value=()=>({id:code.value,label:label.value,next:lines(next.value)});states.append(group);}
  draft.states.forEach(addState);workflow.append(node('h3','Flujo y transiciones'),states,btn('Añadir etapa',()=>addState()));form.append(workflow);
  const preview=node('div',null,'manager-section studio-preview');preview.hidden=true;
  function validateFields(){const list=groups().map(x=>x.value());const seen=new Set(),documents=new Set();for(const [i,f] of list.entries()){if(!/^[a-z][a-z0-9-]{1,39}$/.test(f.id)||seen.has(f.id)||!f.label.trim())throw Error('Revisa el nombre y el código único de la pregunta '+(i+1)+'.');if(f.options&&(!f.options.length||f.options.length>10||new Set(f.options).size!==f.options.length))throw Error('La pregunta '+(i+1)+' necesita de 1 a 10 opciones distintas.');if(f.type==='document'){if(documents.has(f.fixture))throw Error('No repitas el mismo tipo de soporte PDF.');documents.add(f.fixture);}if(f.condition){const prior=list.slice(0,i).find(x=>x.id===f.condition.field);if(!prior?.options?.includes(f.condition.equals))throw Error('La condición de la pregunta '+(i+1)+' debe referirse a una opción de una pregunta anterior.');}seen.add(f.id);}return list;}
  const footer=node('div',null,'studio-footer');const previewError=errorRegion();
  footer.append(btn('Previsualizar formulario',()=>{
   try{
    previewError.textContent='';
    const values=validateFields();
    const plan=inspectConfiguredIntake({
      title:title.value,category:category.value,channel:channel.value,
      fields:values,states:Array.from(states.children,x=>x.value())
    });
    preview.hidden=false;
    preview.replaceChildren(
      node('span','VISTA CIUDADANA · CINCO PASOS','studio-kicker'),
      node('h3',title.value||'Vista previa'),
      node('p','Los trámites configurables usarán la misma secuencia que la certificación de discapacidad, con las preguntas y soportes propios de cada servicio.','module-intro')
    );
    const journey=node('ol',null,'configured-intake-steps');
    for(const step of plan.stages){
      const item=node('li');
      item.append(node('strong',step.title),node('small',step.description));
      if(step.questions.length)item.append(node('span',step.questions.length+' '+(step.questions.length===1?'campo':'campos')+' configurados','state-label'));
      journey.append(item);
    }
    preview.append(journey);
    const notice=node('div',null,'studio-safety');
    notice.append(node('strong',plan.compatible?'Estructura compatible para pruebas':'Configuración por completar'),
      node('p',plan.explanation));
    if(plan.warnings.length){
      const list=node('ul');
      for(const text of plan.warnings)list.append(node('li',text));
      notice.append(list);
    }
    preview.append(notice,node('h4','Preguntas configuradas'));
    dynamicFields(preview,values,{preview:true});
    preview.scrollIntoView({block:'nearest'});
   }catch(e){previewError.textContent=e.message;}
  }));
  form.append(footer,previewError);
  // Restore only unsubmitted design metadata, never citizen health records.
  let localStorageScope;
  try{localStorageScope=window.sessionStorage;}catch{}
  const draftKey='sits:studio:v1:'+String(user?.id||user?.uid||user?.email||'demo')+':new';
  let savedRemotely=false,saveTimer=0;
  const draftSnapshot=()=>({
   id:id.value,title:title.value,description:description.value,category:category.value,
   channel:channel.value,operators:operators.value,
   messages:Object.fromEntries(Object.entries(messages).map(([key,input])=>[key,input.value])),
   fields:groups().map(group=>group.value()),
   states:Array.from(states.children,x=>x.value())
  });
  const scheduleLocalSave=()=>{
   if(current||savedRemotely)return;
   clearTimeout(saveTimer);
   saveTimer=setTimeout(()=>writeStudioDraft(localStorageScope,draftKey,draftSnapshot()),350);
  };
  if(!current){
   for(const name of ['input','change','click'])form.addEventListener(name,scheduleLocalSave);
  }
  submit(form,'Guardar borrador',async()=>{
   const specs=validateFields();
   await operations(()=>invoke('serviceSave',{id:id.value,revision:current?.revision??0,
    schema:{title:title.value,description:description.value,channel:channel.value,category:category.value,
     operators:lines(operators.value),
     messages:Object.fromEntries(Object.entries(messages).map(([key,input])=>[key,input.value])),
     fields:specs,states:Array.from(states.children,x=>x.value())}}),
   async()=>{
    savedRemotely=true;clearTimeout(saveTimer);
    clearStudioDraft(localStorageScope,draftKey);
    await openAdmin('catalog');
   });
  });
  if(!current){
   const previous=readStudioDraft(localStorageScope,draftKey);
   if(previous){
    const recovery=node('div',null,'studio-recovery');
    recovery.setAttribute('role','status');
    recovery.append(node('strong','Hay un diseño sin guardar en esta sesión'),
     node('p','Puedes recuperarlo o descartarlo. No contiene datos de ciudadanos ni documentos clínicos.'));
    const restore=btn('Recuperar diseño',()=>{
     id.value=String(previous.id||'');title.value=String(previous.title||'');
     description.value=String(previous.description||'');channel.value=String(previous.channel||'');
     category.value=String(previous.category||'');operators.value=String(previous.operators||'');
     for(const [key,input] of Object.entries(messages))input.value=String(previous.messages?.[key]||'');
     fields.replaceChildren();
     for(const spec of Array.isArray(previous.fields)?previous.fields.slice(0,16):[])addField(spec);
     states.replaceChildren();
     for(const spec of Array.isArray(previous.states)?previous.states.slice(0,10):[])addState(spec);
     if(!states.children.length)draft.states.forEach(addState);
     refreshOrder();recovery.remove();title.focus();scheduleLocalSave();
    },'primary');
    const discard=btn('Descartar borrador local',()=>{
     clearStudioDraft(localStorageScope,draftKey);recovery.remove();
    },'secondary');
    recovery.append(restore,discard);
    manager.append(recovery);
   }
  }
  manager.append(form,preview);
 }
 function adminCatalog(data){
  const categories=Array.isArray(data.categories)?data.categories:[];
  const services=Array.isArray(data.services)?data.services:[];
  const enabled=categories.filter(c=>c.active).length;
  const published=services.filter(item=>item.state==='published').length;
  const summary=node('div',null,'admin-collection-summary');
  const intro=node('div');
  intro.append(node('span','GESTIÓN DEL CATÁLOGO','studio-kicker'),
   node('h3','Organice los trámites municipales'),
   node('p','Administre las categorías, prepare formularios y controle su publicación desde un mismo lugar.','module-intro'));
  const newService=btn('Crear trámite',()=>editService(null,data),'primary');
  const actions=node('div',null,'admin-collection-actions');
  actions.append(newService);
  summary.append(intro,actions);manager.append(summary);
  const stats=node('div',null,'manager-stats');
  for(const [label,n] of [['Categorías activas',enabled],['Trámites configurados',services.length],['Publicados',published],['Borradores',services.filter(s=>s.state==='draft').length]]){
   const box=node('div');
   box.append(node('small',label),node('strong',String(n)));
   stats.append(box);
  }
  manager.append(stats);
  manager.append(node('p','Estos indicadores corresponden únicamente a servicios configurables. La certificación oficial de discapacidad se gestiona en Expedientes.','admin-scope-note'));
  const categorySection=node('section',null,'manager-section admin-collection');
  const categoryHeader=node('div',null,'admin-collection-head'),categoryCopy=node('div');
  categoryCopy.append(node('h3','Categorías'),node('p','Agrupe los servicios para facilitar su búsqueda a los ciudadanos.','module-intro'));
  categoryHeader.append(categoryCopy);
  const editor=node('details',null,'admin-collection-editor'),summaryButton=node('summary','Nueva categoría');
  editor.append(summaryButton);
  const form=node('form',null,'compact-form admin-category-form');
  const name=field(form,'Nombre de categoría','title','',{required:true,max:70});
  const code=field(form,'Código de categoría (generado automáticamente)','id','',{required:true,max:40});
  code.pattern='[a-z][a-z0-9-]{1,39}';
  let manualCode=false;
  name.addEventListener('input',()=>{
   if(!manualCode)code.value=categoryCode(name.value,categories.map(x=>x.id));
  });
  code.addEventListener('input',()=>{manualCode=true;});
  const help=node('p','El código se propone automáticamente a partir del nombre. Puedes ajustarlo antes de guardar.','admin-category-tip');
  form.append(help);
  submit(form,'Guardar categoría',d=>operations(()=>invoke('categorySave',d),()=>openAdmin('catalog')));
  // The same editor supports create and edit; opening «Nueva categoría»
  // always starts a clean entry after a previous edit.
  summaryButton.addEventListener('click',()=>{
   if(!editor.open){form.reset();manualCode=false;code.readOnly=false;}
  });
  editor.append(form);categoryHeader.append(editor);
  categorySection.append(categoryHeader);
  if(!categories.length){
   const empty=node('div',null,'admin-empty-state');
   empty.append(node('h4','Todavía no hay categorías'),node('p','Cree una categoría para organizar y después diseñar su primer trámite.'));
   empty.append(btn('Crear primera categoría',()=>{editor.open=true;form.elements.id.focus();},'primary'));
   categorySection.append(empty);
  }else{
   const wrapper=node('div',null,'admin-table-scroll'),table=node('table',null,'admin-table');
   const thead=node('thead'),header=node('tr');
   for(const text of ['Categoría','Código','Trámites','Estado','Gestión'])header.append(node('th',text));
   thead.append(header);table.append(thead);
   const body=node('tbody');
   for(const category of [...categories].sort((a,b)=>String(a.title).localeCompare(String(b.title),'es-CO'))){
    const tr=node('tr');
    const number=services.filter(s=>s.draft?.category===category.id).length;
    const titleCell=node('td');titleCell.append(node('strong',category.title));
    const count=node('td',String(number));
    const statusCell=node('td');
    statusCell.append(node('span',category.active?'Activa':'Retirada','state-label'));
    const tools=node('td');tools.className='admin-table-actions';
    tools.append(btn('Editar categoría',()=>{
      editor.open=true;form.elements.id.value=category.id;form.elements.title.value=category.title;manualCode=true;code.readOnly=true;
      form.elements.title.focus();
    },'secondary'));
    if(category.active&&data.canPublish)tools.append(action('Retirar categoría',()=>operations(()=>invoke('categoryRetire',{id:category.id}),()=>openAdmin('catalog'))));
    tr.append(titleCell,node('td',category.id),count,statusCell,tools);body.append(tr);
   }
   table.append(body);wrapper.append(table);categorySection.append(wrapper);
  }
  manager.append(categorySection);
  const serviceSection=node('section',null,'manager-section admin-collection');
  const serviceHead=node('div',null,'admin-collection-head');
  const caption=node('div');
  caption.append(node('h3','Trámites configurados'),node('p','Busque, ordene y gestione cada formulario sin modificar su código.','module-intro'));
  serviceHead.append(caption);serviceSection.append(serviceHead);
  if(!enabled)serviceSection.append(node('p','Puedes comenzar a crear un trámite y añadir su categoría dentro del mismo formulario.','admin-scope-note'));
  const filters=node('div',null,'admin-list-filters');
  const search=field(filters,'Buscar trámite o código','query','',{type:'search'});
  search.placeholder='Nombre o código';
  const state=field(filters,'Estado','state','',{options:{'':'Todos',draft:'Borradores',published:'Publicados',withdrawn:'Retirados'}});
  const catOptions=Object.fromEntries([['','Todas las categorías'],...categories.map(x=>[x.id,x.title])]);
  const category=field(filters,'Categoría','category','',{options:catOptions});
  const order=field(filters,'Ordenar por','order','name',{options:{name:'Nombre (A–Z)',recent:'Última actualización',status:'Estado'}});
  serviceSection.append(filters);
  const visibleCount=node('p',null,'admin-collection-count');visibleCount.setAttribute('role','status');
  const outlet=node('div');serviceSection.append(visibleCount,outlet);
  function renderServices(){
   const items=selectAdminServices(services,{query:search.value,state:state.value,category:category.value,sort:order.value});
   visibleCount.textContent=items.length+' de '+services.length+' trámites configurados';
   outlet.replaceChildren();
   if(!items.length){
    const empty=node('div',null,'admin-empty-state');
    empty.append(node('h4',services.length?'No se encontraron coincidencias':'Todavía no hay trámites configurados'),
     node('p',services.length?'Cambie los filtros para encontrar un trámite.':'Cree una categoría y luego diseñe un formulario.'));
    if(services.length)empty.append(btn('Limpiar filtros',()=>{search.value='';state.value='';category.value='';order.value='name';renderServices();}));
    outlet.append(empty);return;
   }
   const wrapper=node('div',null,'admin-table-scroll'),table=node('table',null,'admin-table');
   const head=node('tr');
   for(const text of ['Trámite','Categoría','Estado','Revisión','Acciones'])head.append(node('th',text));
   const tableHead=node('thead');tableHead.append(head);table.append(tableHead);
   const body=node('tbody');
   for(const item of items){
    const tr=node('tr'),name=node('td'),categoryCell=node('td'),stateCell=node('td'),revision=node('td'),buttons=node('td');
    buttons.className='admin-table-actions';
    name.append(node('strong',item.draft?.title||item.id),node('small',item.id));
    categoryCell.textContent=categories.find(x=>x.id===item.draft?.category)?.title||item.draft?.category||'Sin categoría';
    const chip=node('span',({draft:'Borrador',published:'Publicado',withdrawn:'Retirado'}[item.state]||item.state),'state-label');
    chip.dataset.state=item.state;stateCell.append(chip);
    revision.textContent='Versión '+item.revision;
    buttons.append(btn('Editar trámite',()=>editService(item,data)));
    const more=node('details',null,'admin-row-more');
    more.append(node('summary','Más acciones'));
    const menu=node('div',null,'admin-row-menu');
    const duplicate=node('form',null,'compact-form');
    field(duplicate,'Código para duplicar','id','',{required:true});
    field(duplicate,'Nombre de la copia','title','',{required:true});
    submit(duplicate,'Duplicar',d=>operations(()=>invoke('serviceDuplicate',{...d,sourceId:item.id,revision:0}),()=>openAdmin('catalog')));
    const clone=node('details');
    clone.append(node('summary','Duplicar trámite'),duplicate);menu.append(clone);
    menu.append(action('Ver versiones',async()=>{
      const history=await invoke('serviceHistory',{id:item.id}),entries=node('ol');
      for(const version of history.items)entries.append(node('li','Revisión '+version.revision+' · '+version.state+' · '+new Date(version.at).toLocaleString('es-CO')));
      menu.querySelector('ol')?.remove();menu.append(entries);
    }));
    if(data.canPublish&&item.state==='draft'){
      const publish=node('form',null,'compact-form');
      field(publish,'Referencia de aprobación de Salud','reference','',{required:true,max:180});
      submit(publish,'Publicar trámite',d=>operations(()=>invoke('servicePublish',{...d,id:item.id,revision:item.revision}),async()=>{
       if(endpoint)await connect(endpoint);await openAdmin('catalog');
      }));
      const publishDetails=node('details');publishDetails.append(node('summary','Publicar trámite'),publish);menu.append(publishDetails);
    }
    if(data.canPublish&&item.live)menu.append(action('Retirar trámite',()=>operations(()=>invoke('serviceRetire',{id:item.id,revision:item.revision}),async()=>{
     if(endpoint)await connect(endpoint);await openAdmin('catalog');
    })));
    more.append(menu);buttons.append(more);
    tr.append(name,categoryCell,stateCell,revision,buttons);body.append(tr);
   }
   table.append(body);wrapper.append(table);outlet.append(wrapper);
  }
  for(const control of [search,state,category,order])control.addEventListener(control===search?'input':'change',renderServices);
  renderServices();manager.append(serviceSection);
 }
 function caseList(target,items,staff){
  const source=Array.isArray(items)?items:[];
  const container=node('section',null,'admin-case-browser'),toolbar=node('div',null,'admin-list-filters');
  const search=field(toolbar,staff?'Buscar radicado o trámite':'Buscar en mis solicitudes','query','',{type:'search'});
  search.placeholder='Radicado o nombre del trámite';
  const current=field(toolbar,'Estado','state','',{options:Object.fromEntries([['','Todos los estados'],...Array.from(new Set(source.map(x=>x.status))).sort().map(s=>[s,caseStates[s]||s])])});
  const order=field(toolbar,'Ordenar por','order','recent',{options:{recent:'Más recientes',old:'Más antiguos',activity:'Último movimiento',name:'Nombre del trámite'}});
  container.append(toolbar);
  const count=node('p',null,'admin-collection-count');count.setAttribute('role','status');
  const list=node('div',null,'admin-case-grid');container.append(count,list);target.append(container);
  function render(){
   const visible=selectServiceCases(source,{query:search.value,state:current.value,sort:order.value});
   count.textContent=visible.length+' de '+source.length+' expedientes en esta página';
   list.replaceChildren();
   if(!visible.length){
    const empty=node('div',null,'admin-empty-state');empty.append(node('h4','Sin solicitudes con esos filtros'),
      node('p','Pruebe otro estado o limpie los filtros para consultar los expedientes de esta página.'));
    empty.append(btn('Limpiar filtros',()=>{search.value='';current.value='';order.value='recent';render();}));
    list.append(empty);return;
   }
   for(const item of visible){
    const row=node('article',null,'admin-service-case-card');
    const top=node('div',null,'admin-service-case-top');
    top.append(node('strong',item.radicado||'Sin radicado'),node('span',caseStates[item.status]||item.status||'Estado por verificar','state-label'));
    row.append(top,node('h3',item.title||'Trámite configurado'));
    const created=item.createdAt||item.updatedAt;
    if(created&&!Number.isNaN(new Date(created).getTime())){
     row.append(node('p','Actualizado: '+new Date(created).toLocaleDateString('es-CO'),'admin-service-case-date'));
    }
    row.append(action('Abrir expediente',async()=>{const data=await invoke('serviceCase',{id:item.id});renderCase(row,data,staff);}));
    list.append(row);
   }
  }
  for(const control of [search,current,order])control.addEventListener(control===search?'input':'change',render);
  render();
 }
 function renderCase(target,item,staff){
  target.replaceChildren(node('h3',item.title),node('p',item.radicado+' · '+(item.stateLabels[item.status]||caseStates[item.status]||item.status)));
  for(const file of item.files||[])target.append(action('Descargar '+file.field,async()=>{
   const data=await invoke('serviceDownload',{id:item.id,field:file.field});downloadContent(data,file.field);
  }));
  const refresh=async()=>renderCase(target,await invoke('serviceCase',{id:item.id}),staff);
  if(!staff&&item.correction){
   target.append(node('p','Subsanación solicitada: '+item.correction.label));
   target.append(action('Adjuntar y presentar soporte de prueba',()=>operations(async()=>{
    const file=await fixtureData(item.correction.kind);
    await invoke('serviceSubmitCorrection',{id:item.id,revision:item.revision,file});
   },refresh)));
  }
  for(const [key,value] of Object.entries(item.answers||{}))target.append(node('p',key+' · '+value));
  if(item.history?.length){
   const history=node('details'),events=node('ol');
   history.append(node('summary','Historial de actuaciones'),events);
   const names={'service:created':'Registrada','service:received':'Soportes recibidos','service:closed':'Cerrada','service:correction_requested':'Subsanación solicitada','service:correction_received':'Subsanación recibida'};
   for(const event of item.history)events.append(node('li',(names[event.action]||event.action)+' · '+new Date(event.at).toLocaleString('es-CO')+(event.actorUid?' · '+event.actorUid:'')));
   target.append(history);
  }
  if(!staff)return;
  if(item.correctionOptions?.length){
   const form=node('form',null,'compact-form');
   field(form,'Soporte que debe subsanarse','field',item.correctionOptions[0].id,{options:Object.fromEntries(item.correctionOptions.map(x=>[x.id,x.label]))});
   submit(form,'Solicitar subsanación',d=>operations(()=>invoke('serviceRequestCorrection',{...d,id:item.id,revision:item.revision}),refresh));
   target.append(form);
  }
  for(const [phase,status] of [['ack',item.ackStatus],['correction',item.correctionStatus],['closure',item.deliveryStatus]]){
   if(status==='pending'&&['admin','supervisor'].includes(role))target.append(action(phase==='ack'?'Reintentar acuse':phase==='correction'?'Reintentar aviso de subsanación':'Reintentar aviso de cierre',()=>operations(()=>invoke('serviceRetryMail',{id:item.id,revision:item.revision,phase}),refresh)));
   if(['sending','review'].includes(status))target.append(node('p','El envío requiere conciliación antes de otro intento.'));
  }
  for(const status of item.next)target.append(action(item.stateLabels[status],()=>operations(()=>invoke('serviceTransition',{id:item.id,revision:item.revision,status}),refresh)));
  if(role==='admin'||role==='supervisor'){
   const assignment=node('form',null,'compact-form');
   field(assignment,'UID del operador de destino','uid',item.assignedTo||'',{required:true});
   submit(assignment,'Asignar expediente',d=>operations(()=>invoke('serviceAssign',{...d,id:item.id,revision:item.revision}),refresh));
   target.append(assignment);
  }
  const note=node('form',null,'compact-form');
  field(note,'Nota interna sin datos reales','text','',{required:true,multi:true,max:600});
  submit(note,'Registrar nota',d=>operations(()=>invoke('serviceNote',{...d,id:item.id,revision:item.revision}),refresh));
  for(const entry of item.notes||[])target.append(node('p',entry.text,'plain-content'));
  target.append(note);
 }
 function staffSettings(data){
  const head=node('div',null,'management-header');const copy=node('div');copy.append(node('h3','Equipo institucional'),node('p','Gestiona accesos de operadores y administradores. El rol supervisor está protegido.','module-intro'));head.append(copy);manager.append(head);
  const stats=node('div',null,'manager-stats');for(const [label,n] of [['Accesos visibles',data.items.length],['Activos',data.items.filter(x=>x.active).length],['Revocados',data.items.filter(x=>!x.active).length]]){const box=node('div');box.append(node('small',label),node('strong',String(n)));stats.append(box);}manager.append(stats);
  const editor=node('section',null,'manager-section');editor.append(node('h3','Habilitar o modificar un acceso'),node('p','Utiliza el UID de una cuenta Google institucional ya habilitada en el portal. No se crean contraseñas ni se comparten credenciales.','module-intro'));
  const form=node('form',null,'compact-form');
  field(form,'UID de cuenta institucional habilitada','uid','',{required:true});
  field(form,'Correo institucional','email','',{type:'email',required:true});
  field(form,'Rol','role','operator',{options:{operator:'Operador',admin:'Administrador funcional'}});
  field(form,'Acceso','active','yes',{options:{yes:'Activo',no:'Revocado'}});
  submit(form,'Guardar acceso',d=>operations(()=>invoke('staffSave',{...d,active:d.active==='yes'}),()=>openAdmin('staff')));
  editor.append(form);
  if(Array.isArray(data.invitations)){
   const invite=node('section',null,'manager-section');
   invite.append(node('h3','Invitar un nuevo integrante'),node('p','Crea una invitación por correo institucional. La persona podrá ingresar con Google y activar su acceso durante los próximos siete días; no necesitas conocer su UID.','module-intro'));
   const inviteForm=node('form',null,'compact-form');
   const inviteEmail=field(inviteForm,'Correo del nuevo integrante','email','',{type:'email',required:true,max:254});inviteEmail.placeholder='usuario@sanpedro-valle.gov.co';
   field(inviteForm,'Rol inicial','role','operator',{options:{operator:'Operador',admin:'Administrador funcional'}});
   submit(inviteForm,'Crear invitación',d=>operations(()=>invoke('staffInvite',d),()=>openAdmin('staff')));
   invite.append(inviteForm);
   const pending=node('div',null,'staff-grid');invite.append(pending);
   for(const entry of data.invitations){
    const card=node('article',null,'staff-card'),state=node('span',({pending:'Pendiente',claimed:'Activada',revoked:'Revocada',expired:'Vencida'}[entry.state]||entry.state),'state-label');
    state.dataset.state=entry.state==='claimed'?'published':entry.state==='pending'?'draft':'withdrawn';
    card.append(node('strong',entry.email),node('small',entry.role==='operator'?'Operador':'Administrador funcional'),state,node('small','Vencimiento: '+new Date(entry.expiresAt).toLocaleDateString('es-CO')));
    if(entry.state==='pending')card.append(action('Revocar invitación',()=>operations(()=>invoke('staffRevokeInvite',{email:entry.email}),()=>openAdmin('staff'))));
    pending.append(card);
   }
   if(!data.invitations.length)pending.append(node('p','Todavía no hay invitaciones.','module-intro'));
   manager.append(invite);
  }
  manager.append(editor);
  const directory=node('section',null,'manager-section'),filter=field(directory,'Buscar integrante','staffQuery'),grid=node('div',null,'staff-grid');
  directory.prepend(node('h3','Directorio de gestión'));directory.append(grid);manager.append(directory);
  const render=()=>{
   grid.replaceChildren();
   const needle=filter.value.trim().toLowerCase();
   for(const entry of data.items.filter(x=>(x.email+' '+x.role).toLowerCase().includes(needle))){
    const card=node('article',null,'staff-card'),tag=node('span',entry.active?'Activo':'Revocado','state-label');tag.dataset.state=entry.active?'published':'withdrawn';
    card.append(node('span',(entry.email||'?').slice(0,2).toUpperCase(),'staff-avatar'),node('strong',entry.email),node('small',({operator:'Operador',admin:'Administrador funcional',supervisor:'Supervisor'}[entry.role]||entry.role)),tag);
    if(entry.role!=='supervisor')card.append(btn('Editar acceso',()=>{for(const name of ['uid','email','role'])form.elements[name].value=entry[name];form.elements.active.value=entry.active?'yes':'no';editor.scrollIntoView({block:'nearest'});form.elements.active.focus();}));
    else card.append(node('small','Acceso protegido'));
    grid.append(card);
   }
   if(!grid.children.length)grid.append(node('p','No hay coincidencias.','module-intro'));
  };
  filter.oninput=render;render();
 }
 async function openAdmin(module,after){
  const scope=user;
  for(const el of dashboard.querySelectorAll('.institutional-admin'))el.hidden=true;
  dashboard.dataset.activeModule=module==='catalog'?'catalog':module==='staff'?'staff':'services';
  for(const b of menu.querySelectorAll('button')){const active=b.textContent===({catalog:'Catálogo y formularios',cases:'Expedientes de servicios',staff:'Accesos del personal'}[module]);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
  manager.hidden=false;experience.loading(manager);
  const title=module==='catalog'?'Administrador de trámites y formularios':module==='cases'?'Bandeja de servicios configurados':'Accesos del personal';
  try{
   const action=module==='catalog'?'catalogAdmin':module==='cases'?'serviceInbox':'staffList';
   const value=await invoke(action,{after});
   if(user!==scope)return;
   manager.replaceChildren(node('h2',title));
   if(module==='catalog')adminCatalog(value);
   else if(module==='cases'){
    manager.append(node('p','Los filtros y las cifras se aplican a los expedientes cargados en esta página.','admin-scope-note'));

    caseList(manager,value.items,true);
    if(value.next)manager.append(btn('Siguiente página',()=>openAdmin('cases',value.next)));
    if(after)manager.append(btn('Volver al inicio',()=>openAdmin('cases')));
    manager.append(action('Exportar totales de esta página',async()=>{
     const {csv}=await invoke('serviceExport',{after});
     const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
     const link=node('a');link.href=url;link.download='totales-servicios.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }));
   }
   else staffSettings(value);
   manager.scrollIntoView({block:'nearest'});
  }catch(e){manager.replaceChildren(node('h2',title),node('p',e.message,'error'),btn('Reintentar',()=>openAdmin(module)));}
 }
 const mine=node('section',null,'module-panel catalog-mine hidden');
 document.getElementById('tracking').append(mine);
 async function tracking(after){
  const scope=user;
  if(!user||demo){mine.classList.add('hidden');return;}
  mine.classList.remove('hidden');mine.replaceChildren(node('h2','Solicitudes de otros servicios'));
  const area=node('div');mine.append(area);experience.loading(area);
  try{
   const {items,next}=await invoke('serviceMine',{after});
   if(user!==scope)return;
   area.replaceChildren();caseList(area,items,false);
   if(next)area.append(btn('Siguiente página',()=>tracking(next)));
   if(after)area.append(btn('Volver al inicio',()=>tracking()));
  }catch(e){area.replaceChildren(node('p',e.message,'error'),btn('Reintentar',()=>tracking(after)));}
 }
 renderCatalog();
 return {connect,tracking,setIntakeAvailability(enabled,status){officialActive=enabled??null;if(status)availabilityText=status;renderHomeCatalog();},setSession(next,nextRole){
  user=next;role=nextRole;
  for(const b of menu.querySelectorAll('button')){
   if(b.textContent==='Accesos del personal')b.hidden=role!=='supervisor';
   if(b.textContent==='Catálogo y formularios')b.hidden=!['admin','supervisor'].includes(role);
  }
  if(!user){delete dashboard.dataset.activeModule;manager.hidden=true;mine.classList.add('hidden');serviceBody.replaceChildren();serviceKey=null;activeService=null;}
  else if(pendingService){const target=pendingService;pendingService=null;queueMicrotask(()=>{if(user===next)void openService(target);});}
 }};
}
