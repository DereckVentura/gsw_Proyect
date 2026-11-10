import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
let connection;
try{
 connection=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT??3306),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,...(process.env.DB_SSL==='true'?{ssl:{rejectUnauthorized:true,...(process.env.DB_SSL_CA_BASE64?{ca:Buffer.from(process.env.DB_SSL_CA_BASE64,'base64').toString('utf8')}:{})}}:{})});
 const [[schema]]=await connection.query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('api_rate_limits','audit_events')");
 const [[fleet]]=await connection.query("SELECT COUNT(*) AS total,SUM(publicado) AS publicadas,SUM(publicado AND estado_operativo='operativo' AND placa IS NOT NULL AND kilometraje IS NOT NULL AND precio_dia>0 AND ubicacion_actual_id IS NOT NULL) AS completas FROM vehiculos");
 const [[users]]=await connection.query("SELECT COUNT(*) AS total FROM usuarios WHERE rol='administrador' AND activo=TRUE");
 const [grants]=await connection.query('SHOW GRANTS FOR CURRENT_USER()');
 const ddl=grants.some(row=>Object.values(row).some(v=>/GRANT (?:ALL PRIVILEGES|.*\bCREATE\b)/.test(v)));
 console.info(JSON.stringify({mysql:'conectado',tablas_operaciones:schema.total===2,vehiculos:fleet.total,publicados:Number(fleet.publicadas),fichas_completas:Number(fleet.completas),administradores:users.total,permiso_de_migraciones:ddl},null,2));
}catch{console.error('No se pudo comprobar la instalación. Revisa la conexión privada de MySQL.');process.exitCode=1;}
finally{await connection?.end();}
