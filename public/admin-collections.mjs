// Data-only selectors shared by the institutional catalogue and service inbox.
export const clean=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-CO').trim();
const date=value=>{const n=new Date(value||'').getTime();return Number.isFinite(n)?n:null};
const alpha=(a,b)=>String(a||'').localeCompare(String(b||''),'es-CO');

export function selectAdminServices(services,{query='',category='',state='',sort='name'}={}){
 const needle=clean(query);
 const matches=(Array.isArray(services)?services:[]).filter(service=>{
  if(category&&service.draft?.category!==category)return false;
  if(state&&service.state!==state)return false;
  return !needle||clean([service.draft?.title,service.id,service.draft?.description].join(' ')).includes(needle);
 });
 return matches.sort((a,b)=>{
  if(sort==='recent'){
   const x=date(a.updatedAt||a.modifiedAt),y=date(b.updatedAt||b.modifiedAt);
   if(x!=null&&y!=null&&x!==y)return y-x;
  }
  if(sort==='status'){const x=alpha(a.state,b.state);if(x)return x;}
  return alpha(a.draft?.title,b.draft?.title);
 });
}

export function selectServiceCases(cases,{query='',state='',sort='recent'}={}){
 const needle=clean(query);
 const matches=(Array.isArray(cases)?cases:[]).filter(item=>
  (!state||item.status===state)&&(!needle||clean([item.radicado,item.title].join(' ')).includes(needle)));
 return matches.sort((a,b)=>{
  if(sort==='name')return alpha(a.title,b.title);
  const left=date(sort==='activity'?(a.updatedAt||a.createdAt):a.createdAt);
  const right=date(sort==='activity'?(b.updatedAt||b.createdAt):b.createdAt);
  if(left!==null&&right!==null&&left!==right)return sort==='old'?left-right:right-left;
  return alpha(a.radicado,b.radicado);
 });
}
