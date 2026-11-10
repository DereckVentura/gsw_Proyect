import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import dotenv from 'dotenv';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const name=process.env.DB_NAME;
if(!name||!/^[A-Za-z0-9_]{1,64}$/.test(name))throw new Error('DB_NAME inválido.');
const output=resolve(process.argv[2]??`../backups/autorent-${new Date().toISOString().replace(/[:.]/g,'-')}.sql`);
await mkdir(dirname(output),{recursive:true});
const args=['--single-transaction','--no-tablespaces','--skip-triggers','--set-gtid-purged=OFF','--default-character-set=utf8mb4',`--host=${process.env.DB_HOST}`,`--port=${process.env.DB_PORT??3306}`,`--user=${process.env.DB_USER}`,`--result-file=${output}`];
const ca=resolve(dirname(output),'.temporary-mysql-ca.pem');let caWritten=false;
try{
  if(process.env.DB_SSL==='true'){
    args.push('--ssl-mode=VERIFY_IDENTITY');
    if(process.env.DB_SSL_CA_BASE64){await writeFile(ca,Buffer.from(process.env.DB_SSL_CA_BASE64,'base64'));caWritten=true;args.push(`--ssl-ca=${ca}`);}
  }
  args.push(name);
  const binary=process.env.MYSQLDUMP_PATH??(process.platform==='win32'?'C:/Program Files/MySQL/MySQL Server 8.4/bin/mysqldump.exe':'mysqldump');
  const child=spawn(binary,args,{env:{...process.env,MYSQL_PWD:process.env.DB_PASSWORD},stdio:['ignore','ignore','pipe'],windowsHide:true});
  child.stderr.on('data',()=>{});
  const code=await new Promise((res,rej)=>{child.on('close',res);child.on('error',rej);});
  if(code!==0)throw new Error('BACKUP_INCOMPLETE');
  console.info(`Respaldo creado: ${output}`);
}catch{console.error('No se pudo completar el respaldo. No uses el archivo incompleto; revisa MySQL, permisos y conexión.');process.exitCode=1;}
finally{if(caWritten)await unlink(ca);}
