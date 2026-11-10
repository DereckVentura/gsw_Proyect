// Demostración local independiente. Nunca usa backend/.env ni la base existente.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import express from 'express';

const project=fileURLToPath(new URL('../../',import.meta.url));
const backend=path.join(project,'backend');const local=path.join(project,'.local');
const privateFolder=path.join(backend,'.private');const configPath=path.join(privateFolder,'demo.json');
const port=3319;const children=[];let web;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function child(file,args,options={}){const p=spawn(file,args,{cwd:backend,windowsHide:true,stdio:'inherit',...options});children.push(p);return p;}
async function run(file,args,options={}){const p=child(file,args,options);const code=await new Promise((resolve,reject)=>{p.once('error',reject);p.once('exit',resolve);});if(code!==0)throw Error('No se completó '+path.basename(args[0]??file));}
async function open(port){return new Promise(r=>{const s=net.connect(port,'127.0.0.1');s.once('connect',()=>{s.destroy();r(true);});s.once('error',()=>r(false));});}
function connection(config,password=config.root){return mysql.createConnection({host:'127.0.0.1',port,user:'root',password,dateStrings:true});}
async function main(){
 await mkdir(privateFolder,{recursive:true});await mkdir(local,{recursive:true});
 let config;try{config=JSON.parse(await readFile(configPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;config={root:randomBytes(32).toString('hex'),database:randomBytes(32).toString('hex'),jwt:randomBytes(32).toString('base64url'),admin:randomBytes(18).toString('base64url'),client:randomBytes(18).toString('base64url'),provisioned:false};await writeFile(configPath,JSON.stringify(config),{flag:'wx'});}
 const datadir=path.join(local,'mysql-demo');const base=process.env.AUTORENT_MYSQL_HOME??'C:/Program Files/MySQL/MySQL Server 8.4';const daemon=path.join(base,'bin/mysqld.exe');
 if(!await open(port)){
  try{await access(path.join(datadir,'auto.cnf'));}catch{config.provisioned=false;await writeFile(configPath,JSON.stringify(config));await mkdir(datadir,{recursive:true});await run(daemon,['--no-defaults','--initialize-insecure','--basedir='+base,'--datadir='+datadir,'--console']);}
  child(daemon,['--no-defaults','--basedir='+base,'--datadir='+datadir,'--bind-address=127.0.0.1','--port='+port,'--mysqlx=OFF','--console']);
  for(let i=0;i<90&&!await open(port);i++)await wait(500);
 }
 let root;for(let i=0;i<30&&!root;i++){try{root=await connection(config);}catch(e){if(!config.provisioned){try{root=await connection(config,'');await root.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?",[config.root]);}catch{}}if(!root)await wait(500);}}
 if(!root)throw Error('No se pudo iniciar la base de demostración en 3319.');
 try{
  await root.query('CREATE DATABASE IF NOT EXISTS autorent_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
  await root.query("CREATE USER IF NOT EXISTS 'autorent_demo'@'127.0.0.1' IDENTIFIED BY ?",[config.database]);
  await root.query("GRANT SELECT,INSERT,UPDATE,DELETE ON autorent_demo.* TO 'autorent_demo'@'127.0.0.1'");
  const env={...process.env,DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_NAME:'autorent_demo',DB_USER:'autorent_demo',DB_PASSWORD:config.database,DB_SSL:'false',JWT_SECRET:config.jwt,MIGRATION_DB_USER:'root',MIGRATION_DB_PASSWORD:config.root,NODE_ENV:'development',HOST:'127.0.0.1',PORT:'3002',CORS_ORIGINS:'http://127.0.0.1:8082,http://localhost:8082',TRUST_PROXY_HOPS:'0'};
  await run(process.execPath,['scripts/migrate.mjs'],{env});
  const [[{total}]]=await root.query('SELECT COUNT(*) AS total FROM autorent_demo.vehiculos');
  if(!total)await run(process.execPath,['dist/scripts/import-real-fleet.js'],{env});
  for(const [email,role,password]of [['admin@autorent.local','administrador',config.admin],['cliente@autorent.local','cliente',config.client]]){
   const [[row]]=await root.query('SELECT id FROM autorent_demo.usuarios WHERE email=?',[email]);
   if(!row)await root.query('INSERT INTO autorent_demo.usuarios(nombres,apellidos,email,password_hash,rol,activo) VALUES (?,?,?,?,?,TRUE)',['Cuenta','Demostración',email,await bcrypt.hash(password,12),role]);
  }
  config.provisioned=true;await writeFile(configPath,JSON.stringify(config));
  await writeFile(path.join(privateFolder,'ACCESOS-DEMO.txt'),`AUTORENT UNIVERSIDAD - ACCESOS PRIVADOS LOCALES\n\nWeb: http://127.0.0.1:8082\nAdministrador: admin@autorent.local\nContraseña: ${config.admin}\n\nCliente: cliente@autorent.local\nContraseña: ${config.client}\n\nNo compartir ni subir este archivo a internet. Son cuentas exclusivas de la demostración. No se cambió la base MySQL existente. Usa datos de prueba.\n`);
  if(!await open(3002))child(process.execPath,['dist/server.js'],{env});
  for(let i=0;i<60;i++){try{if((await fetch('http://127.0.0.1:3002/api/v1/health/database')).ok)break;}catch{}await wait(500);}
  if(!await open(8082)){const app=express();app.disable('x-powered-by');app.use(express.static(path.join(project,'mobile/build/web'),{index:'index.html'}));web=app.listen(8082,'127.0.0.1');await new Promise(r=>web.once('listening',r));}
  await writeFile(path.join(local,'demo.pid'),String(process.pid));
  console.info('Demostración disponible en http://127.0.0.1:8082. Los accesos están en backend/.private/ACCESOS-DEMO.txt.');
 }finally{await root.end();}
}
function stop(code=0){web?.close();for(const p of children)p.kill();process.exit(code);}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
main().catch(e=>{console.error('No se inició la demostración:',e.message);stop(1);});
