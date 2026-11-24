import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('browser cannot read or write Firestore directly',()=>{const r=read('firestore.rules');assert.match(r,/allow read, write: if false/);assert.doesNotMatch(r,/allow.+if true/);});
test('public portal is operational and authenticated processing is gated',()=>{assert.match(read('public/app.js'),/const demo=false/);assert.match(read('apps-script/spark/UnifiedBackend.gs'),/SPARK_PILOT_ENABLED/);const f=read('functions/index.js');assert.match(f,/default:false/);assert.match(f,/enforceAppCheck:true/);assert.match(f,/users\//);assert.match(f,/email_verified/);});
test('only supervisor can send, fresh authentication required',()=>{const f=read('functions/index.js');assert.match(f,/u.role!=='supervisor'/);assert.match(f,/auth_time\)>900/);assert.match(f,/q.status!=='awaiting_certificate'/);});
test('only the public institutional endpoint is permitted; no browser bridge key or public Drive sharing',()=>{
 const p=read('public/app.js')+read('public/config.js');
 assert.doesNotMatch(p,/ARCHIVE_KEY|DELIVERY_KEY|HMAC_KEY|computeHmacSha256Signature|service_role/);
 const urls=p.match(/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec/g)||[];
 assert.equal(urls.length,1);
 for(const path of ['apps-script/Common.gs','apps-script/spark/UnifiedBackend.gs'])assert.doesNotMatch(read(path),/setSharing|ANYONE_WITH_LINK/);
 assert.match(read('apps-script/spark/UnifiedBackend.gs'),/sparkVerifyApp_\(p.appCheck\)/);
 assert.match(read('apps-script/spark/UnifiedBackend.gs'),/sparkIdentity_\(p.idToken,false,req.action==='sessionAccess'\)/);
});
test('both script deployments verify request signature',()=>{assert.match(read('apps-script/Common.gs'),/computeHmacSha256Signature/);assert.match(read('apps-script/recepcion/Code.gs'),/signed_\(e,'archive'/);assert.match(read('apps-script/entrega/Code.gs'),/signed_\(e,'delivery'/);});

test('the public portal uses the Supabase configuration and excludes legacy authentication',async()=>{
 const {config}=await import('../public/config.js');
 assert.match(config.supabase.url,/^https:\/\/[a-z]+\.supabase\.co$/);
 assert.match(config.supabase.publishableKey,/^sb_publishable_/);
 const portal=read('public/app.js')+read('public/config.js');
 assert.match(portal,/sits-supabase-v1/);
 assert.doesNotMatch(portal,/firebasejs|firebaseapp\.com|appCheckSiteKey|spark-pilot-v1/);
});
