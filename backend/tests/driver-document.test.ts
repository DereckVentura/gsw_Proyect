import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseDriverDocument} from '../src/validators/driver-document.validator.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=','base64').toString('base64');
const document={titular:'Conductor',pais:'El Salvador',vencimiento:'2035-12-31',consentimiento:true,frente:png,reverso:png};
test('la licencia exige ambas caras, consentimiento y vigencia con fechas reales',()=>{
 const parsed=parseDriverDocument(document);assert.equal(parsed.front.type,'image/png');assert.equal(parsed.holder,'Conductor');
 for(const invalid of [{...document,reverso:undefined},{...document,frente:'<script>alert(1)</script>'},{...document,frente:Buffer.from('imagen falsa con extensión png').toString('base64')},{...document,consentimiento:false},{...document,vencimiento:'2020-01-01'},{...document,vencimiento:'2035-02-30'},{...document,front_key:'otra-persona'}])assert.throws(()=>parseDriverDocument(invalid));
 assert.throws(()=>parseDriverDocument({...document,frente:'A'.repeat(4194308)}));
});
