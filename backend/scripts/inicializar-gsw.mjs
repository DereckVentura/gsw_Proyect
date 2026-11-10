import { spawnSync } from 'node:child_process';
import mysql from 'mysql2/promise';
function run(file) {
  const child=spawnSync(process.execPath,[file],{stdio:'inherit',env:process.env});
  if(child.status!==0)throw new Error('Fallo en '+file);
}
if(process.env.DB_NAME!=='autorent_gsw')throw new Error('Inicializador exclusivo de autorent_gsw.');
run('scripts/migrate.mjs');
const db=await mysql.createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
try {
  const [[row]]=await db.query('SELECT COUNT(*) AS n FROM vehiculos');
  if(Number(row.n)===0) {
    run('dist/scripts/import-real-fleet.js');
    await db.execute("INSERT INTO ubicaciones(nombre,direccion,latitud,longitud,tipo) VALUES ('La Unión','Punto de entrega de laboratorio',13.3369,-87.8439,'sucursal'),('San Miguel','Punto de entrega de laboratorio',13.4833,-88.1833,'sucursal')");
    // Valores ilustrativos, exclusivos del laboratorio y rotulados en la documentación.
    await db.execute('UPDATE vehiculos SET kilometraje=50000,ubicacion_actual_id=(SELECT MIN(id) FROM ubicaciones)');
  }
  await db.query("REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'autorent_app'@'%'");
  await db.query("GRANT SELECT, INSERT, UPDATE, DELETE ON autorent_gsw.* TO 'autorent_app'@'%'");
  console.info('Laboratorio inicializado; datos conservados y permisos de la API limitados a operaciones de datos.');
} finally {await db.end();}
