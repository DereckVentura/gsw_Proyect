import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const email=process.argv[2]?.trim().toLowerCase();
if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Indica el correo de la cuenta administradora.');
const folder=new URL('../.private/',import.meta.url),state=new URL('private-admin-bootstrap.json',folder);
await mkdir(folder,{recursive:true});
let account;try{account=JSON.parse(await readFile(state,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(account&&account.email!==email)throw Error('Ya existe una preparación para otro correo. No se reemplazó.');
if(!account){const password=randomBytes(24).toString('base64url')+'aA1!';account={email,password,hash:await bcrypt.hash(password,12)};await writeFile(state,JSON.stringify(account),{flag:'wx'});}
const c=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
try{await c.execute("INSERT INTO usuarios(nombres,apellidos,email,password_hash,rol,activo) VALUES('Administración','AutoRent',?,?,'administrador',TRUE) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),rol='administrador',activo=TRUE",[email,account.hash]);}finally{await c.end();}
await writeFile(new URL('ACCESO-AUTORENT.txt',folder),`AUTORENT · ACCESO PRIVADO\n\nCorreo: ${email}\nContraseña inicial: ${account.password}\n\nWeb: https://autorent-molina.lovosdavid.chatgpt.site\nLa misma cuenta funciona en la instalación local.\n\nConserva este archivo en privado. No lo incluyas con el instalador ni lo compartas con clientes.\n`);
if(process.argv.includes('--runtime-bootstrap'))process.stdout.write(JSON.stringify({email,hash:account.hash}));
else console.info('Cuenta administradora preparada. Consulta backend/.private/ACCESO-AUTORENT.txt.');
