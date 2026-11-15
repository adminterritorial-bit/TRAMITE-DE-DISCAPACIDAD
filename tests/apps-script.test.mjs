import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const key = 'synthetic-test-key-'.repeat(3);
const portal = 'https://tramite-discapacidad.web.app/';
const requestId = 'a'.repeat(64);
const radicado = 'SP-PIL-'+'A'.repeat(16);
const email = 'ciudadano@example.invalid';

function iterator(array) {
  let cursor=0;
  return {hasNext:()=>cursor<array.length,next:()=>array[cursor++]};
}

function harness() {
  const objects=new Map(), sent=[];
  let quota=10;
  function folder(name) {
    const folders=new Map(), files=new Map();
    return {
      getId:()=>name,
      getFoldersByName:key=>iterator(folders.has(key)?[folders.get(key)]:[]),
      createFolder(key){const child=folder(key);folders.set(key,child);return child;},
      getFilesByName:key=>iterator(files.has(key)?[files.get(key)]:[]),
      createFile(input,content,mime){
        const blob=typeof input==='string'?{name:input,data:Buffer.from(content),mime}:input;
        const id=randomUUID();
        const file={
          getId:()=>id, getParents:()=>iterator([this]), getMimeType:()=>blob.mime,
          getSize:()=>blob.data.length, getBlob:()=>({getBytes:()=>[...blob.data],getDataAsString:()=>blob.data.toString()}),
          setContent:next=>{blob.data=Buffer.from(next);}
        };
        files.set(blob.name,file);objects.set(id,file);return file;
      }
    };
  }
  const root=folder('test-root');
  function load(service) {
    const cache=new Map();
    const props={ROOT_FOLDER_ID:'test-root',HMAC_KEY:key,PORTAL_URL:portal,HEALTH_EMAIL:'salud@example.invalid'};
    const context=createContext({
      PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},
      ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>text})},
      LockService:{getScriptLock:()=>({waitLock(){},hasLock:()=>true,releaseLock(){}})},
      CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},
      Utilities:{
        DigestAlgorithm:{SHA_256:'sha256'},
        computeDigest:(algo,bytes)=>[...createHash(algo).update(Buffer.from(bytes)).digest()],
        computeHmacSha256Signature:(text,secret)=>[...createHmac('sha256',secret).update(text).digest()],
        newBlob:(bytes,mime,name)=>({data:Buffer.from(bytes),mime,name}),
        base64Decode:text=>[...Buffer.from(text,'base64')],
        base64Encode:bytes=>Buffer.from(bytes).toString('base64')
      },
      DriveApp:{getFolderById:()=>root,getFileById:id=>objects.get(id)},
      MimeType:{PLAIN_TEXT:'text/plain'},
      MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:message=>sent.push(message)}
    });
    runInContext(source('apps-script/Common.gs')+'\n'+source('apps-script/'+service+'/Code.gs'),context);
    return (action,data,{secret=key,ts=Date.now(),nonce=randomUUID()}={})=>{
      const body=JSON.stringify({action,data});
      const mac=createHmac('sha256',secret).update(ts+'.'+nonce+'.'+body).digest('hex');
      return JSON.parse(context.doPost({postData:{contents:JSON.stringify({ts,nonce,body,mac})}}));
    };
  }
  return {archive:load('recepcion'),deliver:load('entrega'),sent,setQuota:value=>{quota=value;}};
}

function fixture(kind) {
  const bytes=Buffer.from(source('public/pilot-fixtures/'+kind+'.pdf'));
  return {kind,base64:bytes.toString('base64'),sha:createHash('sha256').update(bytes).digest('hex')};
}

test('Apps Script rejects tampering, expired signatures and repeated signed envelopes',()=>{
  const {archive}=harness();
  const data={requestId,files:[fixture('historia')]};
  assert.equal(archive('save',data,{secret:'incorrect'}).ok,false);
  assert.equal(archive('save',data,{ts:Date.now()-121000}).ok,false);
  const nonce=randomUUID();
  assert.equal(archive('save',data,{nonce}).ok,true);
  assert.equal(archive('save',data,{nonce}).ok,false);
});

test('Apps Script archives, acknowledges, delivers and reads a fixture across both deployments',()=>{
  const {archive,deliver,sent,setQuota}=harness();
  const profile={requestId,radicado,email,portal};
  const input=fixture('historia');
  const save=archive('save',{requestId,files:[input]});
  assert.equal(save.ok,true);
  assert.deepEqual(archive('save',{requestId,files:[input]}),save);
  assert.equal(archive('ack',profile).data.sent,true);
  assert.equal(archive('ack',profile).data.sent,true);
  assert.deepEqual(sent.map(m=>m.to),[email,'salud@example.invalid']);
  const file=fixture('certificate');
  setQuota(0);
  const pending=deliver('deliver',{...profile,file});
  assert.equal(pending.data.sent,false);
  setQuota(5);
  const delivery=deliver('deliver',{...profile,file});
  assert.equal(delivery.data.sent,true);
  assert.deepEqual(delivery.data.certificate,pending.data.certificate);
  assert.deepEqual(deliver('deliver',{...profile,file}),delivery);
  assert.deepEqual(sent.map(m=>m.to),[email,'salud@example.invalid',email]);
  assert.ok(sent.every(m=>!m.attachments));
  const {fileId,sha}=delivery.data.certificate;
  assert.equal(archive('read',{requestId,fileId,sha}).data.base64,file.base64);
  const other='b'.repeat(64);
  assert.equal(archive('save',{requestId:other,files:[input]}).ok,true);
  assert.equal(archive('read',{requestId:other,fileId,sha}).ok,false);
  assert.equal(archive('read',{requestId,fileId,sha:'0'.repeat(64)}).ok,false);
});
