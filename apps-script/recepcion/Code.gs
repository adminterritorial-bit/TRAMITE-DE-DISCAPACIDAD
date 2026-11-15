// Deploy as the Salud account; root folder private. Do not expose the shared secret.
function doPost(e){return signed_(e,'archive',function(a,d){
  var root=DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  if(!/^[a-f0-9]{64}$/.test(d.requestId||''))throw Error('bad id');
  if(a==='save'){
    var folder=folder_(root,d.requestId),out=[];
    if(!Array.isArray(d.files)||d.files.length<1||d.files.length>2)throw Error('bad files');
    d.files.forEach(function(f){if(['historia','apoyo'].indexOf(f.kind)<0)throw Error('bad kind');out.push(savePdf_(folder,f));});
    return {files:out};
  }
  if(a==='read'){
    var folders=root.getFoldersByName(d.requestId);if(!folders.hasNext())throw Error('not found');
    var folder=folders.next(),f=DriveApp.getFileById(d.fileId),parents=f.getParents(),valid=false;
    while(parents.hasNext()){if(parents.next().getId()===folder.getId())valid=true;}
    if(!valid||f.getMimeType()!=='application/pdf'||f.getSize()>5*1024*1024)throw Error('not found');
    var bytes=f.getBlob().getBytes();if(digest_(bytes)!==d.sha)throw Error('hash');
    return {base64:Utilities.base64Encode(bytes)};
  }
  throw Error('action');
});}
