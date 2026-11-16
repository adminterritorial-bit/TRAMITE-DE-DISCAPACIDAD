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
 assert.deepEqual(urls,['https://script.google.com/macros/s/AKfycbyyh3-X79k-EP___nUAgmwCDkGZvpmxTVkuE8NGburWvXxwjZod3DrPikZPuB1KWKxz/exec']);
 for(const path of ['apps-script/Common.gs','apps-script/spark/UnifiedBackend.gs'])assert.doesNotMatch(read(path),/setSharing|ANYONE_WITH_LINK/);
 assert.match(read('apps-script/spark/UnifiedBackend.gs'),/sparkVerifyApp_\(p.appCheck\)/);
 assert.match(read('apps-script/spark/UnifiedBackend.gs'),/sparkIdentity_\(p.idToken,false\)/);
});
test('both script deployments verify request signature',()=>{assert.match(read('apps-script/Common.gs'),/computeHmacSha256Signature/);assert.match(read('apps-script/recepcion/Code.gs'),/signed_\(e,'archive'/);assert.match(read('apps-script/entrega/Code.gs'),/signed_\(e,'delivery'/);});

test('registered Firebase web app is wired into controlled deployment',async()=>{const {config}=await import('../public/config.js');assert.equal(config.mode,'pilot');assert.equal(config.firebase.projectId,'tramite-discapacidad');assert.equal(config.firebase.authDomain,'tramite-discapacidad.firebaseapp.com');assert.equal(config.firebase.appId,'1:91732599743:web:1bb34f5a1cb708b673770a');assert.ok(config.firebase.apiKey);assert.doesNotMatch(read('public/app.js'),/getAnalytics|firebase-analytics/);assert.match(read('scripts/configure-pilot.mjs'),/config\.firebase/);assert.doesNotMatch(read('.github/workflows/firebase-pilot.yml'),/FIREBASE_WEB_CONFIG/);});

test('App Check public site key is wired into the operational portal',async()=>{const {config}=await import('../public/config.js');assert.match(config.appCheckSiteKey,/^[A-Za-z0-9_-]{40}$/);assert.equal(config.mode,'pilot');assert.match(read('scripts/configure-pilot.mjs'),/appCheckSiteKey:config\.appCheckSiteKey/);assert.match(read('public/app.js'),/ReCaptchaEnterpriseProvider\(config\.appCheckSiteKey\)/);assert.doesNotMatch(read('.github/workflows/firebase-pilot.yml'),/APP_CHECK_SITE_KEY/);});
