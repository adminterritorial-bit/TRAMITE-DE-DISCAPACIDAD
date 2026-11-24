import {cpSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';

rmSync('dist',{recursive:true,force:true});
mkdirSync('dist',{recursive:true});
cpSync('public','dist',{recursive:true});
for(const file of ['spark-probe.html','spark-probe.js','spark-pilot.html','spark-pilot.js','pilot.html']){
 rmSync('dist/'+file,{force:true});
}
const endpoint=process.env.SITS_APPS_SCRIPT_ENDPOINT;
if(endpoint){
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint)){
  throw Error('SITS_APPS_SCRIPT_ENDPOINT must be a versioned Google Apps Script web app URL');
 }
 const configPath='dist/config.js';
 const config=readFileSync(configPath,'utf8');
 writeFileSync(configPath,config.replace('export const config = {','export const config = {\n  appsScriptEndpoint:'+JSON.stringify(endpoint)+','));
}
writeFileSync('dist/robots.txt','User-agent: *\nDisallow: /pilot.html\n');
console.log('Static portal packaged.');
