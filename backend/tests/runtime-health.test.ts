import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { HealthService } from '../src/services/health.service.js';

test('el endpoint de salud identifica el nodo y comprueba MySQL antes de declararlo saludable', async()=>{
  let calls=0;
  const service=new HealthService({checkDatabase:async()=>{calls++;}});
  const app=createApp(service);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  try {
    const address=server.address();assert(address && typeof address!=='string');
    const r=await fetch(`http://127.0.0.1:${address.port}/health`);
    const body=await r.json() as {nodo:string;estado:string};
    assert.equal(r.status,200);assert.equal(body.estado,'saludable');
    assert.equal(r.headers.get('x-autorent-node'),body.nodo);assert.equal(calls,1);
  }finally {await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

test('el endpoint de salud devuelve 503 si la dependencia falla', async()=>{
  const service=new HealthService({checkDatabase:async()=>{throw Error('detalle privado');}});
  const server=createApp(service).listen(0,'127.0.0.1');await once(server,'listening');
  try {
    const address=server.address();assert(address && typeof address!=='string');
    const r=await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(r.status,503);assert(!(await r.text()).includes('detalle privado'));
  }finally {await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
