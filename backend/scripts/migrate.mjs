import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const name=process.env.DB_NAME;
if(!name||!/^[A-Za-z0-9_]{1,64}$/.test(name))throw new Error('DB_NAME inválido.');
const connection=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT??3306),database:name,
  user:process.env.MIGRATION_DB_USER??process.env.DB_USER,password:process.env.MIGRATION_DB_PASSWORD??process.env.DB_PASSWORD,
  multipleStatements:false,dateStrings:true,...(process.env.DB_SSL==='true'?{ssl:{rejectUnauthorized:true,...(process.env.DB_SSL_CA_BASE64?{ca:Buffer.from(process.env.DB_SSL_CA_BASE64,'base64').toString('utf8')}:{})}}:{})});
const lock=`autorent_migrate_${name}`;
try{
  const [[row]]=await connection.query('SELECT GET_LOCK(?, 30) AS acquired',[lock]);
  if(row.acquired!==1)throw new Error('Otro proceso está migrando esta base.');
  await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(80) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6))`);
  const folder=new URL('../../database/migrations/',import.meta.url);
  const files=(await readdir(folder)).filter(f=>/^\d{3}_[a-z_]+\.sql$/.test(f)).sort();
  for(const file of files){
    const original=(await readFile(new URL(file,folder),'utf8')).replace(/\r\n/g,'\n');
    const checksum=createHash('sha256').update(original).digest('hex');
    const [known]=await connection.query('SELECT checksum FROM schema_migrations WHERE version=?',[file]);
    if(known.length){if(known[0].checksum!==checksum)throw new Error(`Migración modificada: ${file}`);continue;}
    // Adoptar una instalación anterior solo después de comprobar todos los elementos de esa fase.
    let adopted=false;
    if(file.startsWith('001_')){
      const [tables]=await connection.query("SELECT table_name FROM information_schema.tables WHERE table_schema=? AND table_name IN ('usuarios','categorias','marcas','modelos','ubicaciones','vehiculos','reservas','alquileres','notificaciones')",[name]);
      if(tables.length&&tables.length!==9)throw new Error('Esquema inicial parcial; restaura el respaldo antes de continuar.');
      adopted=tables.length===9;
    }
    if(file.startsWith('002_')){
      const [columns]=await connection.query("SELECT column_name FROM information_schema.columns WHERE table_schema=? AND table_name='vehiculos' AND column_name IN ('codigo_interno','publicado','ficha')",[name]);
      if(columns.length&&columns.length!==3)throw new Error('La migración 002 está incompleta.');
      if(columns.length===3){
        const [nullables]=await connection.query("SELECT column_name FROM information_schema.columns WHERE table_schema=? AND table_name='vehiculos' AND column_name IN ('placa','ubicacion_actual_id','kilometraje','precio_dia') AND is_nullable='YES'",[name]);
        if(nullables.length!==4)throw new Error('La migración 002 requiere revisión.');adopted=true;
      }
    }
    if(file.startsWith('003_')){
      const [tables]=await connection.query("SELECT table_name FROM information_schema.tables WHERE table_schema=? AND table_name IN ('api_rate_limits','audit_events')",[name]);
      if(tables.length===1)throw new Error('La migración 003 está incompleta; revisa el respaldo.');
      adopted=tables.length===2;
    }
    if(!adopted){
      const sql=original.replace(/^\s*--.*$/gm,'').replace(/CREATE DATABASE IF NOT EXISTS autorent[\s\S]*?;/i,'').replace(/\bUSE autorent\s*;/gi,'');
      // Los SQL versionados no contienen procedimientos ni punto y coma dentro de cadenas.
      for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await connection.query(statement);
    }
    await connection.execute('INSERT INTO schema_migrations(version,checksum) VALUES (?,?)',[file,checksum]);
    console.info(`${adopted?'Verificada':'Aplicada'}: ${file}`);
  }
  await connection.query("INSERT INTO categorias(nombre,descripcion) VALUES ('SUV','Vehículos utilitarios deportivos') ON DUPLICATE KEY UPDATE id=id");
  console.info('Base de datos actualizada. No se modificó la flota ni se cargaron datos ficticios.');
}catch(error){console.error(`No se pudo migrar: ${error instanceof Error?error.message:'revisa la conexión y los permisos'}`);process.exitCode=1;}
finally{await connection.query('SELECT RELEASE_LOCK(?)',[lock]).catch(()=>{});await connection.end();}
