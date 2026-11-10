// Ejecutar únicamente contra una instancia temporal explícita, nunca la base del propietario.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import mysql from 'mysql2/promise';
import {createApp} from '../dist/app.js';
import {Database} from '../dist/config/database.js';
import {HealthService} from '../dist/services/health.service.js';
import {AuthService} from '../dist/services/auth.service.js';
import {PasswordService} from '../dist/services/password.service.js';
import {TokenService} from '../dist/services/token.service.js';
import {VehicleService} from '../dist/services/vehicle.service.js';
import {FleetService} from '../dist/services/fleet.service.js';
import {BookingService} from '../dist/services/booking.service.js';
import {MySqlUserRepository} from '../dist/repositories/user.repository.js';
import {MySqlVehicleRepository} from '../dist/repositories/vehicle.repository.js';
import {MySqlFleetRepository} from '../dist/repositories/fleet.repository.js';
import {MySqlBookingRepository} from '../dist/repositories/booking.repository.js';
import {distributedAuthLimiter} from '../dist/middlewares/distributed-limit.middleware.js';

if(process.env.AUTORENT_TEST_PORT!=='3318')throw new Error('Se requiere AUTORENT_TEST_PORT=3318 (instancia temporal).');
const root=await mysql.createConnection({host:'127.0.0.1',port:3318,user:'root',password:'',dateStrings:true});
let database,server,checks=0;
try{
  const [[{total}]]=await root.query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema='autorent_test'");
  assert.equal(total,0,'La base temporal debe estar vacía. No se borrará automáticamente.');
  await root.query('CREATE DATABASE IF NOT EXISTS autorent_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
  const password=randomBytes(24).toString('hex');
  await root.query("CREATE USER 'operations_test'@'127.0.0.1' IDENTIFIED BY ?",[password]);
  await root.query("GRANT ALL ON autorent_test.* TO 'operations_test'@'127.0.0.1'");
  const env={...process.env,DB_HOST:'127.0.0.1',DB_PORT:'3318',DB_NAME:'autorent_test',DB_USER:'operations_test',DB_PASSWORD:password,DB_SSL:'false',JWT_SECRET:randomBytes(32).toString('base64url'),MIGRATION_DB_USER:'operations_test',MIGRATION_DB_PASSWORD:password};
  for(let i=0;i<2;i++){
    const migrated=spawnSync(process.execPath,['scripts/migrate.mjs'],{cwd:new URL('../',import.meta.url),env,encoding:'utf8'});
    assert.equal(migrated.status,0,migrated.stderr);checks++;
  }
  const imported=spawnSync(process.execPath,['dist/scripts/import-real-fleet.js'],{cwd:new URL('../',import.meta.url),env,encoding:'utf8'});
  assert.equal(imported.status,0,imported.stderr);checks++;
  database=new Database({host:env.DB_HOST,port:3318,name:env.DB_NAME,user:env.DB_USER,password});
  const auth=new AuthService(new MySqlUserRepository(database),new PasswordService(),new TokenService({secret:env.JWT_SECRET,expiresInSeconds:3600}));
  server=createServer(createApp(new HealthService({checkDatabase:async()=>{}}),auth,new VehicleService(new MySqlVehicleRepository(database)),new FleetService(new MySqlFleetRepository(database)),new BookingService(new MySqlBookingRepository(database)),{authLimiter:distributedAuthLimiter(database)}));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}/api/v1`;
  async function call(path,{method='GET',body,token,key}={}){
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,...await response.json()};
  }
  async function account(email){const body={nombres:'Prueba',apellidos:'Operaciones',email,password:'Una frase larga para pruebas'};assert.equal((await call('/auth/register',{method:'POST',body})).status,201);return (await call('/auth/login',{method:'POST',body:{email,password:body.password}})).data;}
  const client=await account('cliente@example.test'),other=await account('otro@example.test'),admin=await account('admin@example.test');
  await root.query("UPDATE autorent_test.usuarios SET rol='administrador' WHERE id=?",[admin.user.id]);checks++;
  const fleet=await call('/vehicles');assert.equal(fleet.data.vehicles.length,3);assert(fleet.data.vehicles.every(v=>!v.reservable));checks++;
  assert.equal((await call('/admin/vehicles',{token:client.accessToken})).status,403);checks++;
  const loc=(await call('/admin/locations',{method:'POST',token:admin.accessToken,body:{nombre:'Ubicación temporal de prueba',tipo:'sucursal',direccion:'Solo datos de pruebas',latitud:'13.4',longitud:'-88.1',activo:true}})).data.id;
  const v=fleet.data.vehicles[0];
  assert.equal((await call(`/admin/vehicles/${v.id}`,{method:'PATCH',token:admin.accessToken,body:{placa:'TEST-001',kilometraje:100,precio_dia:'19.99',ubicacion_actual_id:loc}})).status,200);checks++;
  const start=new Date(Date.now()+86400000).toISOString(),end=new Date(Date.now()+2*86400000).toISOString();
  const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=';
  const license=await call('/driver-documents',{method:'POST',token:client.accessToken,body:{titular:'Conductor de prueba',pais:'El Salvador',vencimiento:'2035-12-31',consentimiento:true,frente:image,reverso:image}});assert.equal(license.status,201,JSON.stringify(license));checks++;
  const privateImage=await fetch(base+`/driver-documents/${license.data.document.id}/image?side=front`,{headers:{Authorization:'Bearer '+other.accessToken}});assert.equal(privateImage.status,404);checks++;
  const body={vehiculo_id:v.id,entrega_id:loc,devolucion_id:loc,inicio:start,fin:end,precio_confirmado:'19.99',documento_id:license.data.document.id};
  const quote=await call('/reservations/quote',{method:'POST',token:client.accessToken,body});assert.equal(quote.status,200);assert.equal(quote.data.total,'19.99');checks++;
  assert.equal((await call('/reservations',{method:'POST',token:client.accessToken,body:{...body,documento_id:undefined},key:'missing-license-test'})).status,400);checks++;
  const attempts=await Promise.all(Array.from({length:6},(_,i)=>call('/reservations',{method:'POST',token:client.accessToken,body,key:`concurrent-reservation-${i}`})));
  assert.equal(attempts.filter(r=>r.status===201).length,1,JSON.stringify(attempts));assert(attempts.filter(r=>r.status!==201).every(r=>r.status===409));checks++;
  const calendar=await call(`/vehicles/${v.id}/availability`);assert.equal(calendar.data.periods.length,1);assert.deepEqual(Object.keys(calendar.data.periods[0]).sort(),['fin_utc','inicio_utc']);checks++;
  const winner=attempts.findIndex(r=>r.status===201),id=attempts[winner].data.reservation.id;
  const replay=await call('/reservations',{method:'POST',token:client.accessToken,body,key:`concurrent-reservation-${winner}`});assert.equal(replay.status,200);assert.equal(replay.data.reservation.id,id);checks++;
  assert.equal((await call(`/reservations/${id}`,{token:other.accessToken})).status,404);checks++;
  const adjacent={...body,inicio:end,fin:new Date(Date.parse(end)+86400000).toISOString()};
  const second=await call('/reservations',{method:'POST',token:client.accessToken,body:adjacent,key:'adjacent-reservation-001'});assert.equal(second.status,201);checks++;
  const different={...body,inicio:new Date(Date.parse(end)+2*86400000).toISOString(),fin:new Date(Date.parse(end)+3*86400000).toISOString(),precio_confirmado:'20.00'};
  assert.equal((await call('/reservations',{method:'POST',token:client.accessToken,body:different,key:'price-changed-reservation'})).status,409);checks++;
  assert.equal((await call(`/admin/vehicles/${v.id}`,{method:'PATCH',token:admin.accessToken,body:{estado_operativo:'mantenimiento'}})).status,409);checks++;
  const secondId=second.data.reservation.id;
  assert.equal((await call(`/reservations/${secondId}/cancel`,{method:'POST',token:client.accessToken,body:{}})).status,200);
  assert.equal((await call(`/reservations/${secondId}/cancel`,{method:'POST',token:client.accessToken,body:{}})).status,200);checks++;
  await root.query("UPDATE autorent_test.reservas SET inicio_utc=UTC_TIMESTAMP(6)-INTERVAL 10 MINUTE, fin_utc=UTC_TIMESTAMP(6)+INTERVAL 1 HOUR WHERE id=?",[id]);
  assert.equal((await call(`/reservations/${id}/cancel`,{method:'POST',token:client.accessToken,body:{}})).status,409);checks++;
  assert.equal((await call(`/admin/reservations/${id}/checkout`,{method:'POST',token:client.accessToken,body:{kilometraje:100}})).status,403);checks++;
  assert.equal((await call(`/admin/reservations/${id}/checkout`,{method:'POST',token:admin.accessToken,body:{kilometraje:99,licencia_valida:true}})).status,400);checks++;
  const delivered=await call(`/admin/reservations/${id}/checkout`,{method:'POST',token:admin.accessToken,body:{kilometraje:105,licencia_valida:true}});assert.equal(delivered.status,200);assert.equal(delivered.data.reservation.estado,'en_curso');checks++;
  assert.equal((await call(`/admin/reservations/${id}/return`,{method:'POST',token:admin.accessToken,body:{kilometraje:104,ubicacion_id:loc}})).status,400);checks++;
  await root.query("UPDATE autorent_test.reservas SET fin_utc=UTC_TIMESTAMP(6)-INTERVAL 1 MINUTE WHERE id=?",[id]);
  const lateBody={...body,inicio:new Date(Date.now()+3600000).toISOString(),fin:new Date(Date.now()+7200000).toISOString()};
  const late=await call('/reservations',{method:'POST',token:client.accessToken,body:lateBody,key:'late-rental-reservation'});assert.equal(late.status,201);checks++;
  await root.query("UPDATE autorent_test.reservas SET inicio_utc=UTC_TIMESTAMP(6)-INTERVAL 30 SECOND WHERE id=?",[late.data.reservation.id]);
  const blocked=await call(`/admin/reservations/${late.data.reservation.id}/checkout`,{method:'POST',token:admin.accessToken,body:{kilometraje:105,licencia_valida:true}});assert.equal(blocked.status,409);assert.equal(blocked.error.code,'OPEN_RENTAL');checks++;
  const returned=await call(`/admin/reservations/${id}/return`,{method:'POST',token:admin.accessToken,body:{kilometraje:150,ubicacion_id:loc}});assert.equal(returned.status,200);assert.equal(returned.data.reservation.estado,'completada');checks++;
  assert.equal((await call(`/admin/reservations/${late.data.reservation.id}/checkout`,{method:'POST',token:admin.accessToken,body:{kilometraje:150,licencia_valida:true}})).status,200);checks++;
  assert.equal((await call(`/admin/reservations/${late.data.reservation.id}/return`,{method:'POST',token:admin.accessToken,body:{kilometraje:151,ubicacion_id:loc}})).status,200);checks++;
  const notices=await call('/notifications',{token:client.accessToken});assert(notices.data.unread>=6);checks++;
  const noticeId=notices.data.notifications[0].id;
  assert.equal((await call(`/notifications/${noticeId}/read`,{method:'POST',token:other.accessToken,body:{}})).status,404);
  assert.equal((await call(`/notifications/${noticeId}/read`,{method:'POST',token:client.accessToken,body:{}})).status,200);checks++;
  const [[counts]]=await root.query('SELECT (SELECT COUNT(*) FROM autorent_test.reservas) AS reservations,(SELECT COUNT(*) FROM autorent_test.alquileres WHERE devolucion_real_utc IS NULL) AS open,(SELECT COUNT(*) FROM autorent_test.audit_events) AS events');
  assert.equal(counts.reservations,3);assert.equal(counts.open,0);assert(counts.events>=8);checks++;
  const limits=[];for(let i=0;i<32;i++)limits.push((await call('/auth/login',{method:'POST',body:{}})).status);assert(limits.includes(429));checks++;
  console.info(`${checks} verificaciones MySQL/HTTP completas: carreras, reintentos, permisos, tarifas, límites, cancelaciones, entregas, devoluciones y avisos.`);
}finally{
  if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
  if(database)await database.close();await root.end();
}
