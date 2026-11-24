import test from 'node:test';
import assert from 'node:assert/strict';
import {CITIZEN_INTAKE_STAGES,inspectConfiguredIntake} from '../public/configured-intake-contract.mjs';
const base={title:'Atención al usuario',category:'salud',channel:'Secretaría de Salud',fields:[{id:'motivo',label:'Motivo de la consulta',type:'textarea'}],
 states:[{id:'received',next:['reviewing']},{id:'reviewing',next:['closed']},{id:'closed',next:[]}]};
test('todos los trámites comparten las cinco etapas oficiales del ciudadano',()=>{
 const plan=inspectConfiguredIntake(base);
 assert.equal(plan.stages.length,5);
 assert.deepEqual(plan.stages.map(s=>s.id),CITIZEN_INTAKE_STAGES.map(s=>s.id));
 assert.equal(plan.stages[1].questions[0].id,'motivo');
 assert.equal(plan.compatible,true);
 assert.equal(plan.operational,false,'Una vista previa jamás abre recepción real');
});
test('los documentos incompatibles impiden habilitación inadvertida',()=>{
 const plan=inspectConfiguredIntake({...base,fields:[...base.fields,{id:'anexo',label:'Anexo',type:'document',fixture:'apoyo',required:true}]});
 assert.equal(plan.compatible,false);
 assert.ok(plan.warnings.some(x=>x.includes('soporte principal')));
});
