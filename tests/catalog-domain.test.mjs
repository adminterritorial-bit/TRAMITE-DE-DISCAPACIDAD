import test from 'node:test';
import assert from 'node:assert/strict';
import {filterServices, categoryCounts, normalizeSearch, categoryCode} from '../public/catalog-domain.mjs';

const catalogue = {
 categories:[{id:'certificacion',title:'Certificación'},{id:'promocion',title:'Promoción y prevención'}],
 items:[
  {id:'salud-mental',title:'Orientación en salud mental',description:'Asesoría',category:'promocion'},
  {id:'discapacidad',title:'Certificación de discapacidad',description:'Valoración',category:'certificacion',standard:true},
  {id:'vacunacion',title:'Información de vacunación',description:'Consulta',category:'promocion'}
 ]
};
test('la búsqueda respeta tildes, mayúsculas y categoría', () => {
 assert.equal(normalizeSearch('  Certificación '),'certificacion');
 assert.deepEqual(filterServices(catalogue,{query:'DISCAPACIDAD'}).map(x=>x.id),['discapacidad']);
 assert.deepEqual(filterServices(catalogue,{query:'promocion'}).map(x=>x.id),['vacunacion','salud-mental']);
 assert.deepEqual(filterServices(catalogue,{category:'certificacion'}).map(x=>x.id),['discapacidad']);
 assert.deepEqual(filterServices(catalogue,{query:'discapacidad',category:'promocion'}),[]);
});
test('el trámite institucional prevalece en el orden sin duplicar datos', () => {
 assert.equal(filterServices(catalogue)[0].id,'discapacidad');
 assert.equal(filterServices({items:[]}).length,0);
 assert.equal(filterServices(null).length,0);
});
test('las categorías usan únicamente los trámites realmente disponibles', () => {
 assert.deepEqual(categoryCounts(catalogue).map(x=>x.count),[3,1,2]);
 assert.deepEqual(categoryCounts({categories:[],items:[]}).map(x=>x.count),[0]);
});

test('código automático válido, único y sin palabras reservadas',()=>{
 assert.equal(categoryCode('Gestión de EPS'),'gestion-de-eps');
 assert.equal(categoryCode('Vacunación', ['vacunacion']),'vacunacion-2');
 assert.equal(categoryCode('Discapacidad'),'discapacidad-salud');
 assert.equal(categoryCode('123'),'salud-123');
 assert.equal(categoryCode(''),'');
 assert.match(categoryCode('Secretaría de Salud'),/^[a-z][a-z0-9-]{1,39}$/);
});
