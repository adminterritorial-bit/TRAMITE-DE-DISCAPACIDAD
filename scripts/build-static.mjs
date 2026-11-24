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
 writeFileSync(configPath,config.replace(/appsScriptEndpoint:[^\n]+/,'appsScriptEndpoint:'+JSON.stringify(endpoint)+','));
}
// Assemble the styles in their authoring order into one render-blocking request.
const entryPath='dist/index.html';
const entry=readFileSync(entryPath,'utf8');
const sheets=[...entry.matchAll(/<link rel="stylesheet" href="([a-z-]+\.css)(?:\?[^"]*)?">/g)];
if(sheets.length){
 const combined=sheets.map(match=>readFileSync('public/'+match[1],'utf8')).join('\n');
 writeFileSync('dist/sits.css',combined);
 let bundled=entry.replace(sheets[0][0],'<link rel="stylesheet" href="sits.css?v=1">');
 for(const match of sheets.slice(1))bundled=bundled.replace(match[0],'');
 writeFileSync(entryPath,bundled);
}
writeFileSync('dist/robots.txt','User-agent: *\nDisallow: /pilot.html\n');
console.log('Static portal packaged.');
