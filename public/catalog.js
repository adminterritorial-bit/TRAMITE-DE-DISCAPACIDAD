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
  catch(e){error.textContent=e.message;}
  finally{button.disabled=false;form.removeAttribute('aria-busy');}
 };
}
const standard={id:'discapacidad',title:'Certificación de discapacidad',category:'certificacion',
 description:'Orientación, solicitud y seguimiento de soportes para la certificación de discapacidad.',channel:'Secretaría de Salud',standard:true};
const fixtureNames={historia:'Soporte principal',apoyo:'Anexo'};
const fieldNames={text:'Texto corto',textarea:'Texto amplio',number:'Número',date:'Fecha',select:'Lista',
 radio:'Opción única',checkbox:'Casilla',document:'Documento PDF'};
const caseStates={saving:'Archivando soportes',storage_review:'Archivo por verificar',received:'Recibida',closed:'Cerrada'};

export function serviceCatalog({demo,navigate,invoke,experience,fixtureData,downloadContent}){
 const catalogue=region('Trámites y servicios de Salud','Consulte los servicios publicados y sus canales de atención.');
 catalogue.id='catalog';catalogue.classList.add('catalog-home');
 const service=region('Ficha de trámite','Consulte los requisitos antes de continuar.');
 service.id='service';
 const main=document.getElementById('main');
 const nav=document.querySelector('.nav');
 main.append(catalogue,service);
 const masthead=node('div',null,'catalog-masthead'),copy=node('div');
 copy.append(node('div','ALCALDÍA DE SAN PEDRO · SERVICIOS DIGITALES','catalog-kicker'),catalogue.querySelector('h1'),catalogue.querySelector('.module-intro'));
 const pills=node('div',null,'catalog-pills');
 for(const label of ['Atención municipal','Seguimiento en línea','Documentos protegidos'])pills.append(node('span',label));
 copy.append(pills);
 const visual=node('div',null,'catalog-illustration');visual.setAttribute('aria-hidden','true');
 const visualCard=node('div',null,'catalog-visual-card');
 visualCard.append(node('div','+','catalog-icon'),node('strong','SITS Salud'),node('small','Tu solicitud, en un solo lugar'),node('span',null,'visual-line'),node('span',null,'visual-line short'));
 visual.append(visualCard,node('span','✓','catalog-visual-check'));masthead.append(copy,visual);catalogue.append(masthead);
 const searchBar=node('div',null,'catalog-filters');
 const search=field(searchBar,'Buscar trámite','search');
 const category=field(searchBar,'Categoría','category','',{options:{'':'Todas'}});
 const filters=node('div',null,'catalog-tools');filters.append(searchBar);catalogue.append(filters);search.placeholder='Escribe el nombre del servicio…';
 const list=node('div',null,'document-grid');
 const catalogInfo=node('p',null,'module-intro');catalogInfo.setAttribute('role','status');
 const infoRow=node('div',null,'catalog-info-row');infoRow.append(node('h2','Servicios disponibles'),catalogInfo);catalogue.append(infoRow,list);
 const serviceBody=node('div');
 service.append(serviceBody);
 let publicCatalog={items:[standard],categories:[{id:'certificacion',title:'Certificación'}]};
 let endpoint,activeService,user,role,serviceKey,cacheError;
 const menu=document.querySelector('.admin-module-menu');
 const manager=node('section',null,'module-panel catalog-manager');
 manager.hidden=true;
 const dashboard=document.getElementById('adminDashboard');
 const shortcuts=node('div',null,'workspace-shortcuts');
 shortcuts.hidden=true;
 const shortcutCatalog=btn('Diseñar un trámite →',()=>void openAdmin('catalog'));
 const shortcutCases=btn('Gestionar solicitudes →',()=>void openAdmin('cases'));
 const shortcutStaff=btn('Administrar equipo →',()=>void openAdmin('staff'));
 shortcuts.append(shortcutCatalog,shortcutCases,shortcutStaff);
 dashboard.querySelector('.dashbar').after(shortcuts);
 dashboard.append(manager);
 if(!demo){
  const tab=btn('Catálogo',()=>navigate('catalog'),'navbtn');tab.dataset.view='catalog';
  nav.prepend(tab);
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
  const text=search.value.trim().toLocaleLowerCase('es-CO');
  const chosen=category.value;
  const matched=publicCatalog.items.filter(service=>(!chosen||service.category===chosen)&&
   (service.title+' '+service.description).toLocaleLowerCase('es-CO').includes(text));
  catalogInfo.textContent=cacheError?'El catálogo adicional no está disponible. Puede consultar el trámite de certificación.':'Trámites disponibles: '+matched.length;
  if(!matched.length)list.append(node('p','No hay trámites que coincidan con la búsqueda.'));
  for(const item of matched){
   const card=node('article',null,'module-panel catalog-card');
   const tag=publicCatalog.categories.find(x=>x.id===item.category)?.title;
   const top=node('div',null,'catalog-card-top'),icon=node('span',item.standard?'+':'▤','catalog-icon');icon.setAttribute('aria-hidden','true');top.append(icon);
   if(tag)top.append(node('span',tag,'doc-status'));
   card.append(top,node('h2',item.title),node('p',item.description,'plain-content'),btn('Ver trámite',()=>void openService(item),'primary'));
   list.append(card);
  }
 }
 search.oninput=renderCatalog;
 category.onchange=renderCatalog;
 async function connect(url){
  endpoint=url;
  try{
   const response=await fetch(url+'?content=catalog',{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(7000)});
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
  if(item.standard){navigate('citizen');return;}
  activeService=item;serviceKey=null;
  service.querySelector('h1').textContent=item.title;
  serviceBody.replaceChildren(node('p',item.description,'plain-content'),node('p','Canal de atención: '+item.channel));
  navigate('service');
  if(!user){serviceBody.append(btn('Ingresar para continuar',()=>navigate('citizen'),'primary'));return;}
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
  const draft=current?.draft||{fields:[],states:[{id:'received',label:'Recibida',next:['reviewing']},
   {id:'reviewing',label:'En revisión',next:['closed']},{id:'closed',label:'Cerrada',next:[]}],operators:[]};
  manager.replaceChildren(node('h2',current?'Editar borrador':'Nuevo trámite'));const guide=node('div',null,'builder-intro');for(const text of ['1. Datos generales','2. Campos y documentos','3. Flujo y publicación'])guide.append(node('span',text));manager.append(guide);
  const form=node('form',null,'compact-form');
  const id=field(form,'Código del trámite','id',current?.id||'',{required:true});id.readOnly=!!current;
  field(form,'Nombre del trámite','title',draft.title,{required:true,max:120});
  field(form,'Descripción','description',draft.description,{required:true,multi:true,max:1800});
  field(form,'Categoría','category',draft.category||data.categories.find(x=>x.active)?.id||'',{required:true,
   options:Object.fromEntries(data.categories.filter(x=>x.active).map(x=>[x.id,x.title]))});
  field(form,'Canal autorizado','channel',draft.channel,{required:true,max:180});
  field(form,'UID de operadores autorizados','operators',draft.operators.join('\n'),{multi:true});
  for(const [key,label] of [['ack','Mensaje del acuse'],['correction','Mensaje de subsanación'],['closure','Mensaje de cierre']])
   field(form,label+' sin datos personales','message-'+key,draft.messages?.[key]||'',{multi:true,max:500});
  const fields=node('div',null,'builder-group'),states=node('div',null,'builder-group');
  function addField(spec={}){
   const group=node('fieldset',null,'portal-decisions');group.append(node('legend','Campo del formulario'));
   field(group,'Identificador del campo','id',spec.id,{required:true});
   field(group,'Etiqueta del campo','label',spec.label,{required:true,max:120});
   const type=field(group,'Tipo de campo','type',spec.type||'text',{options:fieldNames});
   const required=field(group,'Obligatorio','required',spec.required?'yes':'no',{options:{yes:'Sí',no:'No'}});
   const value=field(group,'Valor ficticio o lista de opciones (una por línea)','value',spec.options?.join('\n')??spec.fixture??'',{multi:true});
   const kind=field(group,'PDF de prueba','fixture',spec.fixture||'historia',{options:fixtureNames});
   const test=field(group,'Mostrar si el campo anterior indicado tiene un valor','condition',spec.condition?.field||'');
   const equals=field(group,'Valor que activa la condición','equals',spec.condition?.equals||'');
   const update=()=>{kind.parentElement.hidden=type.value!=='document';value.parentElement.hidden=['checkbox','document'].includes(type.value);};
   type.onchange=update;update();
   group.append(btn('Eliminar campo',()=>group.remove()));fields.append(group);
   group.value=()=>{
    const typeValue=type.value;
    return {id:group.querySelector('[name=id]').value,label:group.querySelector('[name=label]').value,type:typeValue,
     required:required.value==='yes',...(['select','radio'].includes(typeValue)?{options:lines(value.value)}:typeValue==='document'?
      {fixture:kind.value}:typeValue==='number'?{fixture:Number(value.value)}:typeValue==='checkbox'?{}:{fixture:value.value}),
     ...(test.value?{condition:{field:test.value,equals:equals.value}}:{})};
   };
  }
  function addState(spec={}){
   const group=node('fieldset',null,'portal-decisions');group.append(node('legend','Etapa del flujo'));
   const id=field(group,'Código de etapa','stateId',spec.id,{required:true});
   const label=field(group,'Nombre de etapa','stateLabel',spec.label,{required:true});
   const next=field(group,'Códigos de las siguientes etapas','next',(spec.next||[]).join(', '));
   group.append(btn('Eliminar etapa',()=>group.remove()));
   group.value=()=>({id:id.value,label:label.value,next:lines(next.value)});
   states.append(group);
  }
  draft.fields.forEach(addField);draft.states.forEach(addState);
  form.append(node('h3','Constructor de formulario'),fields,btn('Añadir campo',()=>addField()),
   node('h3','Flujo y transiciones'),states,btn('Añadir etapa',()=>addState()));
  const preview=node('div',null,'manager-section');preview.hidden=true;
  form.append(btn('Previsualizar formulario',()=>{
   preview.hidden=false;preview.replaceChildren(node('h3','Vista previa'));
   dynamicFields(preview,Array.from(fields.children,x=>x.value()),{preview:true});
  }));
  submit(form,'Guardar borrador',async()=>{
   await operations(()=>invoke('serviceSave',{id:id.value,revision:current?.revision??0,schema:{
    title:form.elements.title.value,description:form.elements.description.value,channel:form.elements.channel.value,
    category:form.elements.category.value,operators:lines(form.elements.operators.value),
    messages:Object.fromEntries(['ack','correction','closure'].map(key=>[key,form.elements['message-'+key].value])),
    fields:Array.from(fields.children,x=>x.value()),states:Array.from(states.children,x=>x.value())
   }}),()=>openAdmin('catalog'));
  });
  manager.append(form,preview,btn('Volver al catálogo',()=>void openAdmin('catalog')));
 }
 function adminCatalog(data){
  const enabled=data.categories.filter(c=>c.active).length;
  const header=node('div',null,'management-header');
  const intro=node('div');intro.append(node('h3','Diseña y publica servicios'),node('p','Configura categorías, formularios, requisitos y etapas sin modificar el código.','module-intro'));header.append(intro);
  if(enabled)header.append(btn('Crear trámite',()=>editService(null,data),'primary'));
  manager.append(header);
  const stats=node('div',null,'manager-stats');
  for(const [label,n] of [['Categorías activas',enabled],['Trámites',data.services.length],['Publicados',data.services.filter(s=>s.state==='published').length],['Borradores',data.services.filter(s=>s.state==='draft').length]]){const box=node('div');box.append(node('small',label),node('strong',String(n)));stats.append(box);}
  manager.append(stats);
  const categorySection=node('section',null,'manager-section');
  const serviceSection=node('section',null,'manager-section');
  const form=node('form',null,'compact-form');
  field(form,'Código de categoría','id','',{required:true});
  field(form,'Nombre de categoría','title','',{required:true,max:70});
  submit(form,'Guardar categoría',d=>operations(()=>invoke('categorySave',d),()=>openAdmin('catalog')));
  categorySection.append(node('h3','Categorías'),form);
  for(const c of data.categories){
   const line=node('div',null,'record');line.append(node('strong',c.title));
   line.append(btn('Editar categoría',()=>{form.elements.id.value=c.id;form.elements.title.value=c.title;form.elements.title.focus();}));
   if(c.active&&data.canPublish)line.append(action('Retirar categoría',()=>operations(()=>invoke('categoryRetire',{id:c.id}),()=>openAdmin('catalog'))));
   categorySection.append(line);
  }
  manager.append(categorySection);
  serviceSection.append(node('h3','Trámites configurados'));
  if(!data.services.length)serviceSection.append(node('p','Aún no hay trámites personalizados. Crea una categoría y luego un trámite.','module-intro'));
  for(const item of data.services){
   const line=node('article',null,'record');
   const state=node('span',({draft:'Borrador',published:'Publicado',withdrawn:'Retirado'}[item.state]||item.state),'state-label');state.dataset.state=item.state;
   line.append(state,node('h3',item.draft.title),node('p','Revisión '+item.revision+' · '+item.id),btn('Editar trámite',()=>editService(item,data)));
   const duplicate=node('form',null,'compact-form');
   field(duplicate,'Código para duplicar','id','',{required:true});field(duplicate,'Nombre de la copia','title','',{required:true});
   submit(duplicate,'Duplicar',d=>operations(()=>invoke('serviceDuplicate',{...d,sourceId:item.id,revision:0}),()=>openAdmin('catalog')));
   const details=node('details');details.append(node('summary','Duplicar trámite'),duplicate);line.append(details);
   line.append(action('Ver versiones',async()=>{
    const history=await invoke('serviceHistory',{id:item.id}),entries=node('ol');
    for(const v of history.items)entries.append(node('li','Revisión '+v.revision+' · '+v.state+' · '+new Date(v.at).toLocaleString('es-CO')));
    line.querySelector('ol')?.remove();line.append(entries);
   }));
   if(data.canPublish&&item.state==='draft'){
    const publish=node('form',null,'compact-form');
    field(publish,'Referencia de aprobación de Salud','reference','',{required:true,max:180});
    submit(publish,'Publicar trámite',d=>operations(()=>invoke('servicePublish',{...d,id:item.id,revision:item.revision}),async()=>{
     if(endpoint)await connect(endpoint);await openAdmin('catalog');
    }));line.append(publish);
   }
   if(data.canPublish&&item.live)line.append(action('Retirar trámite',()=>operations(()=>invoke('serviceRetire',{id:item.id,revision:item.revision}),async()=>{
    if(endpoint)await connect(endpoint);await openAdmin('catalog');
   })));
   serviceSection.append(line);
  }
  manager.append(serviceSection);
 }
 function caseList(target,items,staff){
  const list=node('div',null,'records');
  const filter=staff?field(target,'Buscar en esta página por referencia o trámite','buscar'):null;
  target.append(list);
  const render=()=>{
   list.replaceChildren();
   const needle=filter?.value.trim().toLocaleLowerCase('es-CO')||'';
   const visible=items.filter(x=>(x.radicado+' '+x.title).toLocaleLowerCase('es-CO').includes(needle));
   if(!visible.length)list.append(node('p','No hay solicitudes de servicios configurados.'));
   for(const item of visible){
   const row=node('article',null,'record');
   row.append(node('strong',item.title),node('p',item.radicado+' · '+(caseStates[item.status]||item.status)),
    action('Abrir expediente',async()=>{const data=await invoke('serviceCase',{id:item.id});renderCase(row,data,staff);}));
    list.append(row);
   }
  };
  if(filter)filter.oninput=render;
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
  const editor=node('section',null,'manager-section');editor.append(node('h3','Habilitar o modificar un acceso'),node('p','Utiliza el UID de una cuenta Google institucional ya habilitada en Firebase. No se crean contraseñas ni se comparten credenciales.','module-intro'));
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
    manager.append(node('p','Expedientes de esta página: '+value.items.length));
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
 return {connect,tracking,setSession(next,nextRole){
  user=next;role=nextRole;shortcuts.hidden=!role;shortcutCatalog.hidden=!['admin','supervisor'].includes(role);shortcutStaff.hidden=role!=='supervisor';shortcutCases.hidden=!role;
  for(const b of menu.querySelectorAll('button')){
   if(b.textContent==='Accesos del personal')b.hidden=role!=='supervisor';
   if(b.textContent==='Catálogo y formularios')b.hidden=!['admin','supervisor'].includes(role);
  }
  if(!user){delete dashboard.dataset.activeModule;manager.hidden=true;mine.classList.add('hidden');serviceBody.replaceChildren();serviceKey=null;activeService=null;}
 }};
}
