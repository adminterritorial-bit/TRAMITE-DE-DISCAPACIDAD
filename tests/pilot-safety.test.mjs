import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {fixtureAllowed, profileAllowed, citizenMayDownload} from '../functions/pilot-safety.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const kind of ['historia', 'apoyo', 'certificate']) {
  test('accepts the exact approved PDF for '+kind, () => {
    const pdf = readFileSync(new URL('../public/pilot-fixtures/'+kind+'.pdf', import.meta.url));
    assert.equal(fixtureAllowed({kind, sha:sha(pdf)}), true);
    assert.equal(fixtureAllowed({kind, sha:sha(Buffer.concat([pdf, Buffer.from('private content')]))}), false);
    assert.equal(fixtureAllowed({kind:'other', sha:sha(pdf)}), false);
  });
}

test('only the predefined synthetic identity and bounded options are accepted', () => {
  const sample = {name:'Persona de prueba',documentType:'CC',documentNumber:'TEST001',phone:'',
    support:'',zone:'Cabecera municipal',representation:'propia'};
  assert.equal(profileAllowed(sample), true);
  for (const [field,value] of Object.entries(sample)) {
    assert.equal(profileAllowed({...sample,[field]:value+' text'}), false, field);
  }
});

test('only the owner can fetch an available certificate through citizen access', () => {
  const entry = {ownerUid:'owner',status:'sent',certificate:{fileId:'private'}};
  assert.equal(citizenMayDownload(entry,'owner','certificate'), true);
  assert.equal(citizenMayDownload(entry,'other','certificate'), false);
  assert.equal(citizenMayDownload(entry,'owner','historia'), false);
  assert.equal(citizenMayDownload({...entry,status:'sending'},'owner','certificate'), false);
  assert.equal(citizenMayDownload(undefined,'owner','certificate'), false);
});
