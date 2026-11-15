import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('browser cannot read or write Firestore directly',()=>{const r=read('firestore.rules');assert.match(r,/allow read, write: if false/);assert.doesNotMatch(r,/allow.+if true/);});
test('pilot off by default; app check enforced',()=>{assert.match(read('public/config.js'),/mode:'demo'/);const f=read('functions/index.js');assert.match(f,/default:false/);assert.match(f,/enforceAppCheck:true/);assert.match(f,/pilotUsers/);assert.match(f,/email_verified/);});
test('only supervisor can send, fresh authentication required',()=>{const f=read('functions/index.js');assert.match(f,/u.role!=='supervisor'/);assert.match(f,/auth_time\)>900/);assert.match(f,/q.status!=='awaiting_certificate'/);});
test('no public sharing or browser bridge key',()=>{const p=read('public/app.js')+read('public/config.js');assert.doesNotMatch(p,/ARCHIVE_KEY|DELIVERY_KEY|script\.google\.com\/macros/);assert.doesNotMatch(read('apps-script/Common.gs'),/setSharing/);});
test('both script deployments verify request signature',()=>{assert.match(read('apps-script/Common.gs'),/computeHmacSha256Signature/);assert.match(read('apps-script/recepcion/Code.gs'),/signed_\(e,'archive'/);assert.match(read('apps-script/entrega/Code.gs'),/signed_\(e,'delivery'/);});
