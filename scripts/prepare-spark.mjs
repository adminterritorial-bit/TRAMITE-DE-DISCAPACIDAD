import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';

const base=new URL('../',import.meta.url);
const out=new URL('build/spark-release/',base);
mkdirSync(out,{recursive:true});

const source=path=>readFileSync(new URL(path,base),'utf8').replace(/\r\n/g,'\n').trimEnd()+'\n';
const code=source('apps-script/spark/UnifiedBackend.gs')+'\n'+source('apps-script/spark/SparkAuth.gs')+'\n'+source('apps-script/spark/ServiceCatalog.gs');
const manifest=source('apps-script/spark/appsscript.json');
for(const [name,body] of [['Codigo.gs',code],['appsscript.json',manifest]]){
  writeFileSync(new URL(name,out),body);
  process.stdout.write(createHash('sha256').update(body).digest('hex')+'  '+name+'\n');
}
