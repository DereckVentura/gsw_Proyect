import {access,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const android=new URL('../../mobile/android/',import.meta.url);
const props=new URL('key.properties',android),key=new URL('.private/autorent-upload.jks',android);
try{await access(props);console.info('La firma ya está configurada; no se cambió.');process.exit(0);}catch{}
try{await access(key);throw new Error('Existe una llave sin configuración; recupérala antes de continuar.');}catch(e){if(e?.code!=='ENOENT')throw e;}
await mkdir(new URL('.private/',android),{recursive:true});
const password=randomBytes(32).toString('base64url');
const binary=process.env.KEYTOOL_PATH??(process.platform==='win32'?'C:/Program Files/Android/Android Studio/jbr/bin/keytool.exe':'keytool');
const run=spawnSync(binary,['-genkeypair','-keystore',fileURLToPath(key),'-alias','autorent','-keyalg','RSA','-keysize','3072','-validity','10000','-storetype','PKCS12','-storepass:env','AR_SIGNING_PASSWORD','-keypass:env','AR_SIGNING_PASSWORD','-dname','CN=AutoRent, OU=Software, O=AutoRent, L=San Miguel, C=SV'],{env:{...process.env,AR_SIGNING_PASSWORD:password},stdio:'ignore',windowsHide:true});
if(run.status!==0)throw new Error('No se pudo generar la firma; revisa keytool.');
await writeFile(props,`storeFile=.private/autorent-upload.jks\nstorePassword=${password}\nkeyAlias=autorent\nkeyPassword=${password}\n`,{mode:0o600,flag:'wx'});
console.info('Firma privada de Android preparada. Guarda una copia segura de key.properties y .private; nunca los publiques.');
