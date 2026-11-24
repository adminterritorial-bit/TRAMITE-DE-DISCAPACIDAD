import {calculateCaseIndicators} from './admin-metrics.mjs';

// A single institutional navigation and indicators shell for SITS Salud.
// The case backend remains authoritative; partial pages never become totals.
const modules = {
  'Expedientes':{id:'cases',description:'Solicitudes de certificación',icon:'folder'},
  'Catálogo y formularios':{id:'catalog',description:'Crear y publicar trámites',icon:'layout'},
  'Expedientes de servicios':{id:'services',description:'Trámites configurados',icon:'file'},
  'Avisos':{id:'notices',description:'Información a la ciudadanía',icon:'bell'},
  'Políticas':{id:'policies',description:'Documentos y condiciones',icon:'shield'},
  'Solicitudes de titulares':{id:'rights',description:'Protección de datos',icon:'users'},
  'Accesos del personal':{id:'staff',description:'Funcionarios y permisos',icon:'key'}
};
const iconPaths={
 folder:'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
 layout:'M3 3h18v18H3z M3 9h18 M9 9v12',
 file:'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6m-6 4h6',
 bell:'M5 17h14l-2-2V9a5 5 0 0 0-10 0v6z M10 21h4',
 shield:'M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10z M8 12l3 3 5-6',
 users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M17 8a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9',
 key:'M15 7a5 5 0 1 0 2 4l5-5-2-2-2 2-2-2z'
};
const make=(tag,text,cls)=>{
 const x=document.createElement(tag);
 if(text!==undefined)x.textContent=text;
 if(cls)x.className=cls;
 return x;
};
const icon=(kind)=>{
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');
 svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');
 svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
 svg.setAttribute('aria-hidden','true');svg.classList.add('admin-tile-icon');
 const path=document.createElementNS(svg.namespaceURI,'path');
 path.setAttribute('d',iconPaths[kind]||iconPaths.file);
 svg.append(path);return svg;
};
export function mountAdminWorkspace({dashboard,menu}){
 const surface=menu.parentElement;
 const heading=make('div',undefined,'admin-nav-heading');
 const copy=make('div');
 copy.append(make('span','ESPACIO INSTITUCIONAL','admin-kicker'),make('h2','Áreas de gestión'),make('p','Seleccione el módulo que necesita gestionar.'));
 heading.append(copy);
 surface.prepend(heading);
 surface.setAttribute('aria-label','Áreas de gestión institucional');
 const overview=make('section',undefined,'admin-overview');
 overview.setAttribute('aria-label','Indicadores de expedientes');
 const intro=make('div',undefined,'admin-overview-heading');
 const introText=make('div');
 introText.append(make('span','SEGUIMIENTO OPERATIVO','admin-kicker'),make('h2','Resumen de solicitudes'));
 const note=make('p','Los indicadores aparecen cuando carga la bandeja autorizada.','admin-overview-caption');
 intro.append(introText,note);
 const kpis=make('div',undefined,'admin-kpi-grid');
 const specs=[
  ['total','Expedientes','Visibles en la bandeja'],
  ['review','Por revisar','Recibidos o en revisión'],
  ['corrections','Subsanación','Requieren documentos'],
  ['toCertificate','Por certificar','Pendientes de certificado'],
  ['resolved','Resueltos','Enviados, archivados o no proceden'],
  ['sent','Certificados enviados','Entrega registrada']
 ];
 const values={};
 for(const [key,title,help] of specs){
  const card=make('article',undefined,'admin-kpi-card');
  card.dataset.kind=key;
  const caption=make('span',title),number=make('strong','—'),description=make('small',help);
  number.className='admin-kpi-value';number.dataset.metric=key;
  card.append(caption,number,description);kpis.append(card);values[key]=number;
 }
 overview.append(intro,kpis);
 dashboard.insertBefore(overview,dashboard.querySelector('.dashbar'));
 function decorate(){
  for(const button of menu.querySelectorAll('button')){
   const label=button.textContent.trim();
   const meta=modules[label];if(!meta)continue;
   button.dataset.module=meta.id;
   button.dataset.description=meta.description;
   if(!button.querySelector('svg'))button.prepend(icon(meta.icon));
  }
  setActive();
 }
 function setActive(){
  const current=dashboard.dataset.activeModule||'cases';
  for(const button of menu.querySelectorAll('button')){
   const active=button.dataset.module===current;
   if(active)button.setAttribute('aria-current','page');
   else button.removeAttribute('aria-current');
  }
 }
 const menuObserver=new MutationObserver(decorate);
 menuObserver.observe(menu,{childList:true});
 const stateObserver=new MutationObserver(setActive);
 stateObserver.observe(dashboard,{attributes:true,attributeFilter:['data-active-module']});
 menu.addEventListener('click',event=>{
  const button=event.target.closest('button[data-module]');
  if(button)dashboard.dataset.activeModule=button.dataset.module;
 });
 window.addEventListener('sits:official-metrics',event=>{
  const detail=event.detail||{};
  const verified=detail.exact===true&&calculateCaseIndicators(detail.metrics);
  if(!verified){
   for(const value of Object.values(values))value.textContent='—';
   note.textContent='La bandeja solo devolvió una página. Consulte sus resultados sin tratarlos como totales generales.';
   return;
  }
  for(const [key,value] of Object.entries(verified))values[key].textContent=value.toLocaleString('es-CO');
  note.textContent=detail.demo?'Datos ficticios de demostración.':detail.filtered?'Indicadores según los filtros aplicados a la bandeja.':'Indicadores reales · bandeja institucional autorizada.';
 });
 decorate();
 return {refresh:decorate};
}
