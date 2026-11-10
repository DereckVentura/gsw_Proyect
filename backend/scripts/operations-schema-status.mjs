import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
let connection;
try{
  connection=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT??3306),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
  const [[row]]=await connection.execute("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('api_rate_limits','audit_events')");
  process.exitCode=row.total===2?0:2;
}catch{console.error('No se pudo comprobar la base de datos. Revisa backend/.env y el servicio MySQL.');process.exitCode=1;}
finally{await connection?.end();}
