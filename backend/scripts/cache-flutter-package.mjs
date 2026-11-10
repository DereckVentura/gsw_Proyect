// Herramienta de preparación local: descarga oficial, comprueba SHA-256 y extrae el paquete.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {setDefaultResultOrder} from 'node:dns';
setDefaultResultOrder('ipv4first');
async function download(url){
  let last;
  for(let i=0;i<5;i++){try{const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);return Buffer.from(await response.arrayBuffer());}catch(e){last=e;console.info(`Reintentando descarga oficial (${i+1}/5)`);}}
  throw last;
}
const cache=process.env.PUB_CACHE??join(process.env.LOCALAPPDATA,'Pub','Cache');
for(const name of process.argv.slice(2)){
  if(!/^[a-z][a-z0-9_]+$/.test(name))throw new Error('Nombre inválido');
  const info=JSON.parse((await download(`https://pub.dev/api/packages/${name}`)).toString('utf8'));
  const latest=info.latest;
  const archive=await download(latest.archive_url);
  if(createHash('sha256').update(archive).digest('hex')!==latest.archive_sha256)throw new Error('SHA-256 no coincide');
  const dest=join(cache,'hosted','pub.dev',`${name}-${latest.version}`),temp=join(cache,`${name}.tar.gz`);
  await mkdir(dest,{recursive:true});await writeFile(temp,archive);
  const unpack=spawnSync('tar.exe',['-xzf',temp,'-C',dest],{encoding:'utf8'});if(unpack.status!==0)throw new Error(unpack.stderr);
  await readFile(join(dest,'pubspec.yaml'));
  await mkdir(join(cache,'hosted','pub.dev','.cache'),{recursive:true});
  await writeFile(join(cache,'hosted','pub.dev','.cache',`${name}-versions.json`),JSON.stringify({...info,_fetchedAt:new Date().toISOString()}));
  await mkdir(join(cache,'hosted-hashes','pub.dev'),{recursive:true});
  await writeFile(join(cache,'hosted-hashes','pub.dev',`${name}-${latest.version}.sha256`),latest.archive_sha256);
  console.info(`Verificado ${name} ${latest.version}`);
}
