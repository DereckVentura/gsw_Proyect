import { createHash } from 'node:crypto';
import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { DatabaseConnectionProvider } from '../config/database.js';
import type { User } from '../models/user.model.js';
import { ApiError } from '../utils/api-error.js';
import { bodyObject } from '../validators/booking.validator.js';

export interface BusinessContent {
  nombre: string; direccion: string; municipio: string; telefono: string;
  correo: string | null; responsable: string | null;
  faq: Array<{ pregunta: string; respuesta: string }>;
}
export const defaultBusiness: BusinessContent = {
  nombre: 'Rent a Car Molina', municipio: 'La Unión, La Unión Sur',
  direccion: 'Mercado Municipal de La Unión', telefono: '+503 7149 2867',
  correo: null, responsable: null,
  faq: [
    {pregunta:'¿Cuáles son las tarifas?',respuesta:'Ambas Mitsubishi Outlander: USD 40 por día. Nissan Rogue: USD 35 por día.'},
    {pregunta:'¿Qué documento necesito?',respuesta:'Adjunta ambas caras de tu licencia de conducir, vigente durante todo el alquiler. La administración la verificará antes de entregar el vehículo.'},
    {pregunta:'¿Cómo funcionan las fechas?',respuesta:'Los días reservados aparecen en gris. Se cobra cada bloque de 24 horas iniciado y el total se presenta antes de confirmar.'},
    {pregunta:'¿Puedo cancelar una reserva?',respuesta:'Puedes cancelarla desde Mis reservas antes de la hora de inicio. Después, contacta a la administración.'},
  ],
};

export function legalDocuments(business: BusinessContent) {
  const contacto = `${business.nombre}. ${business.direccion}, ${business.municipio}. Teléfono: ${business.telefono}.${business.correo ? ` Correo: ${business.correo}.` : ' Correo de privacidad: pendiente de designación.'}`;
  const documents = [
    {id:'privacidad',titulo:'Aviso de privacidad',texto:`${contacto} AutoRent utiliza los datos de tu cuenta para gestionar reservas. La licencia de conducir se solicita para verificar al conductor y se guarda con acceso restringido al titular y la administración. Las contraseñas se guardan mediante hash. Desde Cuenta → Privacidad y mis datos puedes consultar tus datos y presentar solicitudes.`},
    {id:'terminos',titulo:'Condiciones de uso',texto:`${contacto} Revisa el vehículo, lugares, fechas y total antes de confirmar. Cada bloque de 24 horas iniciado cuenta como un día. Es obligatorio adjuntar ambas caras de una licencia vigente durante toda la reserva. La administración verificará la licencia antes de la entrega. Puedes cancelar desde Mis reservas antes del inicio. Coordina las condiciones de entrega y pago con la empresa.`},
  ];
  return { version: createHash('sha256').update(JSON.stringify(documents)).digest('hex'), documents };
}
export interface LegalAcceptance { version: string; documents: ReturnType<typeof legalDocuments>['documents'] }
export function parseAcceptance(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'LEGAL_ACCEPTANCE_REQUIRED', 'Lee y acepta las condiciones y confirma haber leído el aviso de privacidad.');
  const item = body as Record<string, unknown>;
  if (Object.keys(item).some(k => !['version', 'privacidad', 'terminos'].includes(k)) || item.privacidad !== true || item.terminos !== true || typeof item.version !== 'string' || !/^[a-f0-9]{64}$/.test(item.version)) throw new ApiError(400, 'LEGAL_ACCEPTANCE_REQUIRED', 'Confirma ambos documentos y su versión vigente.');
  return item.version;
}
export async function storeAcceptance(connection: PoolConnection, user: number, context: 'registro' | 'reserva', acceptance: LegalAcceptance, reservation: number | null = null) {
  await connection.execute('INSERT INTO legal_acceptances(usuario_id,reserva_id,contexto,version,documentos) VALUES (?,?,?,?,?)', [user, reservation, context, acceptance.version, JSON.stringify(acceptance.documents)]);
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa los textos y su longitud.');
  return value.trim();
}
export function parseBusiness(value: unknown): BusinessContent {
  const b = bodyObject(value, ['nombre','direccion','municipio','telefono','correo','responsable','faq']);
  if (!Array.isArray(b.faq) || b.faq.length > 30) throw new ApiError(400, 'VALIDATION_ERROR', 'Puedes publicar hasta 30 preguntas.');
  const correo = b.correo ? text(b.correo, 254) : null;
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ApiError(400, 'VALIDATION_ERROR', 'Revisa el correo de contacto.');
  return { nombre:text(b.nombre,100),direccion:text(b.direccion,255),municipio:text(b.municipio,120),telefono:text(b.telefono,30),correo,responsable:b.responsable ? text(b.responsable,160):null,
    faq:b.faq.map(item => { const q=bodyObject(item,['pregunta','respuesta']);return {pregunta:text(q.pregunta,160),respuesta:text(q.respuesta,2000)}; }) };
}
interface Row extends RowDataPacket { id: number; [key: string]: any }
const requestTypes = ['acceso','rectificacion','supresion','oposicion','portabilidad','olvido','limitacion','retiro_consentimiento','reclamo'];
export class LegalService {
  constructor(private readonly database: DatabaseConnectionProvider) {}
  async business(connection?: PoolConnection): Promise<BusinessContent> {
    const read = async (c:PoolConnection) => { const [rows]=await c.query<Row[]>('SELECT contenido FROM business_content WHERE id=1'); const content=rows[0] ? (typeof rows[0].contenido==='string'?JSON.parse(rows[0].contenido):rows[0].contenido) as BusinessContent : defaultBusiness; return {...content,faq:content.faq.some(q=>/universitario|académic|demostración/.test(q.respuesta))?defaultBusiness.faq:content.faq}; };
    return connection ? read(connection) : this.database.withConnection(read);
  }
  async content(connection?:PoolConnection) { const business=await this.business(connection); return {business,...legalDocuments(business)}; }
  async acceptance(value: unknown,connection?:PoolConnection): Promise<LegalAcceptance> { const version=parseAcceptance(value); const current=await this.content(connection); if(version!==current.version) throw new ApiError(409,'LEGAL_VERSION_CHANGED','Las condiciones cambiaron. Vuelve a leerlas antes de confirmar.'); return {version,documents:current.documents}; }
  async save(value:unknown) { const business=parseBusiness(value); await this.database.withConnection(c=>c.execute('INSERT INTO business_content(id,contenido) VALUES (1,?) ON DUPLICATE KEY UPDATE contenido=VALUES(contenido)',[JSON.stringify(business)]));return this.content(); }
  async requests(user:User,page:number,limit:number) { return this.database.withConnection(async c=>{const admin=user.rol==='administrador';const [rows]=await c.execute<Row[]>(`SELECT p.*,u.email,u.nombres,u.apellidos FROM privacy_requests p JOIN usuarios u ON u.id=p.usuario_id ${admin?'':'WHERE usuario_id=?'} ORDER BY p.id DESC LIMIT ? OFFSET ?`,[...(admin?[]:[user.id]),limit,(page-1)*limit]);return {requests:rows,page,limit};}); }
  async request(user:User,value:unknown) { const b=bodyObject(value,['tipo','detalle']); if(typeof b.tipo!=='string'||!requestTypes.includes(b.tipo))throw new ApiError(400,'VALIDATION_ERROR','Selecciona el tipo de solicitud.'); const detail=text(b.detalle,2000);return this.database.withConnection(async c=>{
    await c.beginTransaction(); try { await c.execute('SELECT id FROM usuarios WHERE id=? FOR UPDATE',[user.id]); const [[count]]=await c.query<Row[]>('SELECT COUNT(*) AS total FROM privacy_requests WHERE usuario_id=? AND creado_en > UTC_TIMESTAMP() - INTERVAL 1 DAY',[user.id]);if(Number(count!.total)>=10)throw new ApiError(429,'TOO_MANY_REQUESTS','Ya recibimos diez solicitudes hoy. Puedes seguir la respuesta de las existentes o usar el contacto publicado.');const [r]=await c.execute<ResultSetHeader>('INSERT INTO privacy_requests(usuario_id,tipo,detalle) VALUES (?,?,?)',[user.id,String(b.tipo),detail]);await c.commit();return {id:r.insertId,estado:'recibida'};}catch(e){await c.rollback();throw e;}
  }); }
  async respond(admin:User,id:number,value:unknown) { const b=bodyObject(value,['estado','respuesta']); if(!['en_revision','respondida'].includes(String(b.estado))) throw new ApiError(400,'VALIDATION_ERROR','Selecciona el estado de atención.');const answer=text(b.respuesta,3000);return this.database.withConnection(async c=>{await c.beginTransaction();try{const [requests]=await c.execute<Row[]>('SELECT usuario_id FROM privacy_requests WHERE id=? FOR UPDATE',[id]);if(!requests[0])throw new ApiError(404,'REQUEST_NOT_FOUND','No existe esa solicitud.');await c.execute('UPDATE privacy_requests SET estado=?,respuesta=?,respondida_por=? WHERE id=?',[String(b.estado),answer,admin.id,id]);await c.execute('INSERT INTO audit_events(actor_id,entity_type,entity_id,action) VALUES (?,?,?,?)',[admin.id,'privacy_request',id,'responded']);await c.execute('INSERT INTO notificaciones(usuario_id,titulo,mensaje) VALUES (?,?,?)',[requests[0].usuario_id,'Tu solicitud tiene una respuesta',`Consulta la constancia #${id} en Privacidad y mis datos.`]);await c.commit();return {id,estado:b.estado};}catch(e){await c.rollback();throw e;}}); }
  async export(user:User) { return this.database.withConnection(async c=>{const query=async(sql:string)=>{const [rows]=await c.execute<Row[]>(sql,[user.id]);return rows;};await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await c.beginTransaction();try{const result={exportado_en:new Date().toISOString(),formato:'AutoRent datos propios v1',user,reservas:await query('SELECT * FROM reservas WHERE cliente_id=? ORDER BY id'),alquileres:await query('SELECT a.* FROM alquileres a JOIN reservas r ON r.id=a.reserva_id WHERE r.cliente_id=? ORDER BY a.id'),avisos:await query('SELECT * FROM notificaciones WHERE usuario_id=? ORDER BY id'),aceptaciones:await query('SELECT contexto,reserva_id,version,documentos,aceptado_en FROM legal_acceptances WHERE usuario_id=? ORDER BY id'),solicitudes:await query('SELECT id,tipo,detalle,estado,respuesta,creado_en,actualizado_en FROM privacy_requests WHERE usuario_id=? ORDER BY id')};await c.commit();return result;}catch(e){await c.rollback();throw e;}}); }
}
