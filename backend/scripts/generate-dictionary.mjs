import {readFile,writeFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';
const config=JSON.parse(await readFile(new URL('../.private/demo.json',import.meta.url),'utf8'));
const c=await mysql.createConnection({host:'127.0.0.1',port:3319,database:'autorent_demo',user:'autorent_demo',password:config.database});
try{
const [columns]=await c.query("SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_KEY FROM information_schema.columns WHERE table_schema=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION");
let text='# Diccionario de datos\n\nEstructura comprobada en la base de demostración. No contiene registros de usuarios. Los importes DECIMAL se manejan como cadenas y las fechas de operación se interpretan en UTC.\n\n';
let last;
for(const row of columns){if(last!==row.TABLE_NAME){last=row.TABLE_NAME;text+=`\n## ${last}\n\n| Campo | Tipo | Nulo | Clave |\n|---|---|---|---|\n`;}text+=`| ${row.COLUMN_NAME} | ${row.COLUMN_TYPE.replaceAll('|','/')} | ${row.IS_NULLABLE} | ${row.COLUMN_KEY||'—'} |\n`;}
await writeFile(new URL('../../docs/data-dictionary.md',import.meta.url),text);
const [relations]=await c.query("SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,COLUMN_NAME");
await writeFile(new URL('../../docs/diagrams/relations.json',import.meta.url),JSON.stringify(relations,null,2));
console.log(`${new Set(columns.map(c=>c.TABLE_NAME)).size} tablas documentadas, ${columns.length} columnas, ${relations.length} relaciones.`);
}finally{await c.end();}
