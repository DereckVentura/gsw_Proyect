import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import {fileURLToPath} from 'node:url';
dotenv.config({path:fileURLToPath(new URL('../.env',import.meta.url)),quiet:true});
const c=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
try{await c.beginTransaction();
 for(const [code,plate,price] of [['OUTLANDER-GRIS','P 43 9C5','40.00'],['OUTLANDER-ROJA','P 37 DE9','40.00'],['ROGUE-GRIS','P 15 F44','35.00']]){
  await c.execute('UPDATE vehiculos SET placa=?,precio_dia=? WHERE codigo_interno=?',[plate,price,code]);
 }
 await c.commit();console.info('Tarifas y placas confirmadas aplicadas a las tres unidades.');
}catch{await c.rollback();console.error('No se actualizaron las unidades. Revisa la conexión.');process.exitCode=1;}finally{await c.end();}
