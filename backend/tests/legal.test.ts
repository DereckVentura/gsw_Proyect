import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultBusiness, legalDocuments, parseAcceptance, parseBusiness } from '../src/services/legal.service.js';

test('cada versión de documentos identifica exactamente el texto aceptado', () => {
 const initial=legalDocuments(defaultBusiness);assert.match(initial.version,/^[a-f0-9]{64}$/);assert.equal(initial.version,legalDocuments({...defaultBusiness}).version);
 assert.notEqual(initial.version,legalDocuments({...defaultBusiness,telefono:'+503 7000 0000'}).version);
 assert(initial.documents.every(d=>! /universitario|académico|demostración/i.test(d.texto)));
 assert(initial.documents.some(d=>d.texto.includes('licencia')));
});
test('la aceptación requiere ambas decisiones explícitas y no permite campos extras',()=>{
 const body={version:legalDocuments(defaultBusiness).version,privacidad:true,terminos:true};assert.equal(parseAcceptance(body),body.version);
 for(const invalid of [null,{}, {...body,privacidad:false},{...body,terminos:'true'},{...body,version:'old'}, {...body,publicidad:true}])assert.throws(()=>parseAcceptance(invalid));
});
test('el contenido público admite preguntas editables y valida los límites',()=>{
 assert.deepEqual(parseBusiness(defaultBusiness),defaultBusiness);
 assert.throws(()=>parseBusiness({...defaultBusiness,correo:'sin correo'}));
 assert.throws(()=>parseBusiness({...defaultBusiness,faq:Array.from({length:31},()=>({pregunta:'P',respuesta:'R'}))}));
 assert.throws(()=>parseBusiness({...defaultBusiness,faq:[{pregunta:'P',respuesta:'R',oculto:'x'}]}));
});
