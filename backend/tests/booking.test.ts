import assert from 'node:assert/strict';
import {test} from 'node:test';
import {priceForPeriod} from '../src/models/booking.model.js';
import {parseReservation,parseIdempotency,parseLocation,parseCheckout,parseReturn} from '../src/validators/booking.validator.js';
import {parseDeployment} from '../src/config/deployment.js';

test('cobro exacto por bloques de 24 horas, sin error de flotantes',()=>{
  assert.deepEqual(priceForPeriod('19.99','2026-11-01T00:00:00Z','2026-11-02T00:00:00Z'),{dias_cobrados:1,precio_dia:'19.99',total:'19.99',moneda:'USD'});
  assert.equal(priceForPeriod('19.99','2026-11-01T00:00:00Z','2026-11-02T00:00:00.001Z').total,'39.98');
  assert.equal(priceForPeriod('0.01','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z').total,'3.65');
  for(const price of ['0.00','-2.00','10.5','NaN'])assert.throws(()=>priceForPeriod(price,'2026-11-01T00:00:00Z','2026-11-02T00:00:00Z'));
  assert.throws(()=>priceForPeriod('99999999.99','2026-01-01T00:00:00Z','2027-01-01T00:00:00Z'));
});
test('periodos estrictos y normalización UTC',()=>{
  const body={vehiculo_id:1,entrega_id:2,devolucion_id:2,inicio:'2026-11-01T09:00:00-06:00',fin:'2026-11-02T09:00:00-06:00'};
  assert.equal(parseReservation(body).inicio_utc,'2026-11-01T15:00:00.000Z');
  for(const bad of [{...body,vehiculo_id:'1'},{...body,cliente_id:8},{...body,inicio:'2026-11-01T09:00'},{...body,fin:body.inicio},{...body,fin:'2028-11-01T09:00:00Z'},{...body,precio_confirmado:40}])assert.throws(()=>parseReservation(bad));
  assert.equal(parseIdempotency('a'.repeat(24)),'a'.repeat(24));assert.throws(()=>parseIdempotency('short'));
});
test('ubicaciones y operaciones rechazan valores manipulados',()=>{
  const location={nombre:'Sucursal',tipo:'sucursal',direccion:'Dirección real',latitud:'13.5',longitud:'-88.1',activo:true};
  assert.equal(parseLocation(location).longitud,'-88.1');
  for(const bad of [{...location,latitud:'91'},{...location,longitud:'Infinity'},{...location,activo:'true'},{...location,tipo:'otro'}])assert.throws(()=>parseLocation(bad));
  assert.throws(()=>parseCheckout({kilometraje:-1}));assert.throws(()=>parseReturn({kilometraje:10,ubicacion_id:0}));
});
test('alojamiento exige orígenes exactos, TLS verificable y fotos configuradas completamente',()=>{
  const config=parseDeployment({CORS_ORIGINS:'https://autorent.example',DB_SSL:'true',DB_POOL_SIZE:'8'});
  assert.equal(config.ssl?.rejectUnauthorized,true);assert.equal(config.poolSize,8);
  for(const source of [{CORS_ORIGINS:'*'},{CORS_ORIGINS:'https://example.com/'},{DB_POOL_SIZE:'0'},{DB_SSL:'yes'},{CLOUDINARY_API_SECRET:'secret'}])assert.throws(()=>parseDeployment(source));
});
