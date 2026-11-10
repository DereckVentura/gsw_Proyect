import { Router } from 'express';
import type { LegalService } from '../services/legal.service.js';
import type { AuthService } from '../services/auth.service.js';
import { createRequireAuth } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/role.middleware.js';
import { wholeNumber } from '../validators/booking.validator.js';
import type { User } from '../models/user.model.js';
import { ApiError } from '../utils/api-error.js';

export function createLegalRouter(legal:LegalService,auth:AuthService) {
 const router=Router();const login=createRequireAuth(auth);const admin=requireRole('administrador');
 router.get('/content',async(_q,r)=>{r.json({success:true,data:await legal.content()});});
 router.get('/legal/:document',async(q,r)=>{const data=await legal.content();const doc=data.documents.find(d=>d.id===q.params.document);if(!doc)throw new ApiError(404,'DOCUMENT_NOT_FOUND','Documento no encontrado.');r.setHeader('Content-Disposition',`attachment; filename="autorent-${doc.id}.txt"`);r.type('text/plain').send(`${doc.titulo}\nVersion SHA-256: ${data.version}\n\n${doc.texto}`);});
 router.put('/admin/content',login,admin,async(q,r)=>{r.json({success:true,data:await legal.save(q.body)});});
 router.get('/privacy/export',login,async(_q,r)=>{r.setHeader('Content-Disposition','attachment; filename="mis-datos-autorent.json"');r.json({success:true,data:await legal.export(r.locals.user as User)});});
 router.get('/privacy/requests',login,async(q,r)=>{const page=Number(q.query.page??1),limit=Number(q.query.limit??20);wholeNumber(page,1,100000);wholeNumber(limit,1,50);r.json({success:true,data:await legal.requests(r.locals.user as User,page,limit)});});
 router.post('/privacy/requests',login,async(q,r)=>{r.status(201).json({success:true,data:await legal.request(r.locals.user as User,q.body)});});
 router.put('/admin/privacy/requests/:id',login,admin,async(q,r)=>{r.json({success:true,data:await legal.respond(r.locals.user as User,wholeNumber(Number(q.params.id)),q.body)});});
 return router;
}
