import test from 'node:test';
import assert from 'node:assert/strict';
import {readStudioDraft,writeStudioDraft,clearStudioDraft,STUDIO_DRAFT_TTL_MS} from '../public/studio-draft.mjs';
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
test('el borrador institucional permanece durante la sesión',()=>{
 const store=memory(),schema={title:'Atención comunitaria',fields:[{id:'zona',type:'text'}]};
 assert.equal(writeStudioDraft(store,'studio:test',schema,1000),true);
 assert.deepEqual(readStudioDraft(store,'studio:test',1001),schema);
 clearStudioDraft(store,'studio:test');
 assert.equal(readStudioDraft(store,'studio:test',1002),null);
});
test('caducan borradores antiguos o inválidos',()=>{
 const store=memory();
 writeStudioDraft(store,'studio:test',{title:'Borrador'},1000);
 assert.equal(readStudioDraft(store,'studio:test',1000+STUDIO_DRAFT_TTL_MS+1),null);
 store.setItem('studio:invalid','{corrupt');
 assert.equal(readStudioDraft(store,'studio:invalid'),null);
});
