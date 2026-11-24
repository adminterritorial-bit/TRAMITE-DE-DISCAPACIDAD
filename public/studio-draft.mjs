// Session-local form-design drafts; never store citizen or medical submissions.
export const STUDIO_DRAFT_TTL_MS = 12 * 60 * 60 * 1000;
export function readStudioDraft(storage,key,now=Date.now()){
 try{
  if(!storage||!key)return null;
  const parsed=JSON.parse(storage.getItem(key)||'null');
  if(!parsed||!Number.isSafeInteger(parsed.savedAt)||parsed.savedAt>now
     ||now-parsed.savedAt>STUDIO_DRAFT_TTL_MS
     ||!parsed.schema||typeof parsed.schema!=='object'||Array.isArray(parsed.schema)){
   storage.removeItem(key);return null;
  }
  return parsed.schema;
 }catch{return null;}
}
export function writeStudioDraft(storage,key,schema,now=Date.now()){
 try{
  if(!storage||!key||!schema||typeof schema!=='object')return false;
  const value=JSON.stringify({savedAt:now,schema});
  if(value.length>80000)return false;
  storage.setItem(key,value);
  return true;
 }catch{return false;}
}
export function clearStudioDraft(storage,key){
 try{storage?.removeItem(key);}catch{}
}
