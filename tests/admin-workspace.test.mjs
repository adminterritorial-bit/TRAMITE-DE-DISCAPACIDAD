import test from 'node:test';
import assert from 'node:assert/strict';
import {clean,selectAdminServices,selectServiceCases} from '../public/admin-collections.mjs';
import {calculateCaseIndicators} from '../public/admin-metrics.mjs';

test('trámites: búsqueda accesible, categoría, publicación y orden',()=>{
 const items=[
  {id:'ayuda',state:'draft',draft:{title:'Orientación',category:'salud'},updatedAt:'2026-01-01T00:00:00Z'},
  {id:'cert',state:'published',draft:{title:'Certificación',category:'cert'},updatedAt:'2026-04-02T00:00:00Z'},
  {id:'vacuna',state:'published',draft:{title:'Vacunación',category:'salud'},updatedAt:'2026-03-01T00:00:00Z'}
 ];
 assert.equal(clean(' CERTIFICACIÓN '),'certificacion');
 assert.deepEqual(selectAdminServices(items,{query:'CERTIFICACION'}).map(x=>x.id),['cert']);
 assert.deepEqual(selectAdminServices(items,{category:'salud',state:'published'}).map(x=>x.id),['vacuna']);
 assert.deepEqual(selectAdminServices(items,{sort:'recent'}).map(x=>x.id),['cert','vacuna','ayuda']);
 assert.deepEqual(selectAdminServices([],{}),[]);
});
test('solicitudes: filtros y orden no cambian los registros de origen',()=>{
 const items=[
  {radicado:'SP-1',title:'Certificación',status:'received',createdAt:'2026-03-01'},
  {radicado:'SP-2',title:'Orientación',status:'closed',createdAt:'2026-03-04'}
 ];
 assert.deepEqual(selectServiceCases(items,{state:'received'}).map(x=>x.radicado),['SP-1']);
 assert.deepEqual(selectServiceCases(items,{sort:'old'}).map(x=>x.radicado),['SP-1','SP-2']);
 assert.deepEqual(selectServiceCases(items,{query:'orientacion'}).map(x=>x.radicado),['SP-2']);
 assert.equal(items[0].radicado,'SP-1');
});
test('indicadores: datos agregados reales, estados excluyentes y ausencia de datos',()=>{
 assert.equal(calculateCaseIndicators(null),null);
 assert.deepEqual(calculateCaseIndicators({received:3,reviewing:2,needs_documents:1,awaiting_certificate:4,delivered:5,closed:1,not_proceed:2}),{
  total:18,review:5,corrections:1,toCertificate:4,resolved:8,sent:5
 });
});
