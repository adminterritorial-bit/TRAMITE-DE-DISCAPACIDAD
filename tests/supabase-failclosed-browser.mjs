import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 const jsErrors=[];page.on('pageerror',err=>jsErrors.push(err.message));
 await page.route('https://script.google.com/macros/s/**',route=>{
  // Emulate the existing published Apps Script v2: it must be rejected.
  const url=new URL(route.request().url());
  const reply=url.searchParams.has('content')
   ?{ok:true,enabled:true,build:'spark-unified-2.0',documents:[]}
   :{ok:true,enabled:true,build:'spark-unified-2.0'};
  return route.fulfill({json:reply,headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.goto('http://127.0.0.1:8080/',{waitUntil:'domcontentloaded'});
 await page.getByRole('status').filter({hasText:'Recepción electrónica no disponible'}).waitFor({timeout:20000});
 assert.equal(await page.locator('#adminDashboard').isVisible(),false,'Must not enable the institutional workspace with old backend');
 assert.equal(await page.locator('#adminNav').isVisible(),false);
 assert.equal(await page.locator('#applicationForm').isVisible(),false);
 assert.deepEqual(jsErrors,[]);
 console.log('Supabase cutover: old Apps Script version rejected, no clinical upload or staff access.');
}finally{await browser.close();}
