import express from 'express';
import {fileURLToPath} from 'node:url';
import {access} from 'node:fs/promises';
const folder=fileURLToPath(new URL('../../mobile/build/web/',import.meta.url));
try{await access(folder+'index.html');}catch{console.error('Primero compila mobile con flutter build web.');process.exit(1);}
const app=express();app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-cache');next();});app.use(express.static(folder));
app.listen(8080,'127.0.0.1',()=>console.info('AutoRent: http://127.0.0.1:8080 (mantén también el servidor API encendido).'));
