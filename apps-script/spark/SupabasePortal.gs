// Adapt the versioned records used by the catalog and institutional workflows.
// The adapter is selected only inside a Supabase request, including public views.
let sitsPortalActive_=false;

function sitsPortalRun_(operation){
 sitsPortalActive_=true;
 try{return operation();}finally{sitsPortalActive_=false;}
}
function sitsPortalDocument_(row){
 return {name:spName_(row.collection,row.record_id),updateTime:String(row.revision),fields:spFields_(row.data)};
}
function sitsPortalRead_(collection,id){
 const rows=sitsSbRows_('sits_portal_records',
  'select=collection,record_id,data,revision&collection=eq.'+encodeURIComponent(collection)
   +'&record_id=eq.'+encodeURIComponent(id)+'&limit=1',null,true);
 return rows.length?sitsPortalDocument_(rows[0]):null;
}
function sitsPortalQuery_(collection,field,value,sort,max,op,cursor){
 const rows=sitsSbRpc_('sits_portal_query',{
  _collection:collection,_field:field,_value:field?value:null,_contains:op==='ARRAY_CONTAINS',
  _sort:sort,_limit:max,_after:cursor?spDecode_(cursor.fields[sort]):null,
  _after_id:cursor?cursor.name.split('/').pop():null
 },null,true);
 return rows.map(sitsPortalDocument_);
}
function sitsPortalCommit_(writes){
 const batch=writes.map(write=>{
  const [collection,id]=(write.verify||write.update.name).split('/').slice(-2);
  const source={collection,id,revision:write.currentDocument.updateTime||null};
  if(write.update){
   source.data=spData_(write.update.fields);
   source.timestamps=(write.updateTransforms||[]).map(x=>x.fieldPath);
  }
  return source;
 });
 try{return sitsSbRpc_('sits_portal_commit',{_writes:batch},null,true);}
 catch(err){if(err.message==='revision_conflict')throw Error('content_version_changed');throw err;}
}

function sitsPortalStaff_(user,action,data){
 if(user.role!=='supervisor')throw Error('forbidden');
 instRecent_(user);
 if(action!=='staffList')catInviteEmail_(data.email);
 spLimit_(user,action,action==='staffList'?60:20);
 return sitsSbRpc_('sits_portal_staff',{_actor:user.uid,_action:action,_input:data},null,true);
}
function sitsPortalAssignee_(id){
 const rows=sitsSbRows_('sits_staff_members','select=active&user_id=eq.'+encodeURIComponent(id)+'&limit=1',null,true);
 return rows[0]?.active===true;
}
