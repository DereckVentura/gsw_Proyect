import { createHash, randomUUID } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { DatabaseConnectionProvider } from '../config/database.js';
import type { CheckoutInput, LocationInput, ReservationInput, ReturnInput } from '../models/booking.model.js';
import { priceForPeriod } from '../models/booking.model.js';
import type { User } from '../models/user.model.js';
import { ApiError } from '../utils/api-error.js';
import { parseDriverDocument } from '../validators/driver-document.validator.js';
import { storeAcceptance, type LegalService } from '../services/legal.service.js';

interface Row extends RowDataPacket { id: number }
interface VehicleRow extends Row { placa: string | null; precio_dia: string | null; kilometraje: number | null; ubicacion_actual_id: number | null; estado_operativo: string; publicado: number; eligible: number }
interface ReservationRow extends Row {
  documento_id: string | null; codigo: string; cliente_id: number; vehiculo_id: number; entrega_id: number; devolucion_id: number;
  inicio_utc: string; fin_utc: string; estado: string; total: string;
}
interface ClockRow extends RowDataPacket { now: string }
interface CountRow extends RowDataPacket { total: number }
const SELECT = `SELECT r.*, CONCAT(ma.nombre, ' ', mo.nombre) AS vehiculo_nombre,
  JSON_UNQUOTE(JSON_EXTRACT(v.ficha, '$.color')) AS color, v.imagen_url,
  CONCAT(u.nombres, ' ', u.apellidos) AS cliente_nombre,
  e.nombre AS entrega_nombre, d.nombre AS devolucion_nombre,
  dd.holder AS documento_titular, dd.country AS documento_pais, dd.expires_on AS documento_vencimiento, dd.status AS documento_estado,
  a.id AS alquiler_id, a.salida_real_utc, a.devolucion_real_utc, a.km_salida, a.km_regreso
  FROM reservas r JOIN vehiculos v ON v.id = r.vehiculo_id
  JOIN modelos mo ON mo.id = v.modelo_id JOIN marcas ma ON ma.id = mo.marca_id
  JOIN usuarios u ON u.id = r.cliente_id JOIN ubicaciones e ON e.id = r.entrega_id
  JOIN ubicaciones d ON d.id = r.devolucion_id LEFT JOIN alquileres a ON a.reserva_id = r.id LEFT JOIN driver_documents dd ON dd.id = r.documento_id`;

function fail(status: number, code: string, message: string): never { throw new ApiError(status, code, message); }
function sqlDate(iso: string): string { return iso.slice(0, -1).replace('T', ' '); }
function instant(sql: string): number { return Date.parse(`${sql.replace(' ', 'T')}Z`); }
function present(row: ReservationRow): Record<string, unknown> {
  const result: Record<string, unknown> = { ...row };
  for (const key of ['inicio_utc', 'fin_utc', 'cancelada_en', 'creado_en', 'actualizado_en', 'salida_real_utc', 'devolucion_real_utc']) {
    if (typeof result[key] === 'string') result[key] = new Date(instant(result[key] as string)).toISOString();
  }
  result.documento = row.documento_id ? {id:row.documento_id,titular:row.documento_titular,pais:row.documento_pais,vencimiento:row.documento_vencimiento,estado:row.documento_estado} : null;
  return result;
}
async function clock(connection: PoolConnection): Promise<string> {
  const [rows] = await connection.query<ClockRow[]>('SELECT UTC_TIMESTAMP(6) AS now');
  return rows[0]!.now;
}
async function actor(connection: PoolConnection, user: User, admin = false): Promise<void> {
  const [rows] = await connection.execute<Row[]>('SELECT id, rol FROM usuarios WHERE id = ? AND activo = TRUE FOR UPDATE', [user.id]);
  if (!rows[0]) fail(401, 'INVALID_TOKEN', 'Tu sesión ya no está activa.');
  if (admin && rows[0].rol !== 'administrador') fail(403, 'FORBIDDEN', 'Se requiere una cuenta administradora.');
  if (!admin && rows[0].rol !== 'cliente') fail(403, 'CLIENT_REQUIRED', 'Las reservas se crean desde una cuenta cliente.');
}
async function location(connection: PoolConnection, id: number): Promise<void> {
  const [rows] = await connection.execute<Row[]>('SELECT id FROM ubicaciones WHERE id = ? AND activo = TRUE FOR SHARE', [id]);
  if (!rows[0]) fail(400, 'INVALID_LOCATION', 'Elige un punto de entrega o devolución activo.');
}
async function audit(connection: PoolConnection, user: User, id: number, action: string): Promise<void> {
  await connection.execute('INSERT INTO audit_events (actor_id, entity_type, entity_id, action) VALUES (?, ?, ?, ?)', [user.id, 'reserva', id, action]);
}
async function notify(connection: PoolConnection, userId: number, reservationId: number, title: string, message: string): Promise<void> {
  await connection.execute('INSERT INTO notificaciones (usuario_id, reserva_id, titulo, mensaje) VALUES (?, ?, ?, ?)', [userId, reservationId, title, message]);
}
async function read(connection: PoolConnection, id: number): Promise<Record<string, unknown>> {
  const [rows] = await connection.execute<ReservationRow[]>(`${SELECT} WHERE r.id = ?`, [id]);
  if (!rows[0]) fail(404, 'RESERVATION_NOT_FOUND', 'La reserva no existe.');
  return present(rows[0]);
}
async function lockVehicle(connection: PoolConnection, id: number): Promise<VehicleRow> {
  const [rows] = await connection.execute<VehicleRow[]>(`SELECT v.*, (c.activo AND ma.activo) AS eligible
    FROM vehiculos v JOIN categorias c ON c.id = v.categoria_id JOIN modelos mo ON mo.id = v.modelo_id
    JOIN marcas ma ON ma.id = mo.marca_id WHERE v.id = ? FOR UPDATE`, [id]);
  if (!rows[0]) fail(404, 'VEHICLE_NOT_FOUND', 'El vehículo no existe.');
  return rows[0];
}
function ready(vehicle: VehicleRow): void {
  if (!vehicle.publicado || !vehicle.eligible || vehicle.estado_operativo !== 'operativo') fail(409, 'VEHICLE_UNAVAILABLE', 'El vehículo no está habilitado para reservas.');
  if (!vehicle.placa || vehicle.precio_dia === null || Number(vehicle.precio_dia) <= 0 || vehicle.kilometraje === null || vehicle.ubicacion_actual_id === null) fail(409, 'VEHICLE_INCOMPLETE', 'La empresa debe completar la tarifa y los datos del vehículo antes de reservar.');
}
async function noConflict(connection: PoolConnection, input: ReservationInput): Promise<void> {
  const [conflicts] = await connection.execute<Row[]>(`SELECT id FROM reservas WHERE vehiculo_id = ?
    AND estado IN ('confirmada', 'en_curso') AND ? < fin_utc AND ? > inicio_utc LIMIT 1 FOR UPDATE`,
  [input.vehiculo_id, sqlDate(input.inicio_utc), sqlDate(input.fin_utc)]);
  if (conflicts.length) fail(409, 'RESERVATION_CONFLICT', 'Las fechas seleccionadas ya están reservadas. Elige otras fechas.');
}

export class MySqlBookingRepository {
  constructor(private readonly database: DatabaseConnectionProvider, private readonly legal?: LegalService) {}

  async availability(id:number) {
    return this.run(()=>this.database.withConnection(async c=>{
      const [cars]=await c.execute<Row[]>('SELECT id FROM vehiculos WHERE id=? AND publicado=TRUE',[id]);
      if(!cars[0])fail(404,'VEHICLE_NOT_FOUND','El vehículo no existe.');
      const [rows]=await c.execute<Row[]>("SELECT inicio_utc,fin_utc FROM reservas WHERE vehiculo_id=? AND estado IN ('confirmada','en_curso') AND fin_utc>UTC_TIMESTAMP() ORDER BY inicio_utc",[id]);
      return {periods:rows.map(r=>({inicio_utc:new Date(instant(String(r.inicio_utc))).toISOString(),fin_utc:new Date(instant(String(r.fin_utc))).toISOString()}))};
    }));
  }
  async uploadDocument(user:User,value:unknown) {
    const input=parseDriverDocument(value),id=randomUUID();
    return this.transaction(async c=>{
      await actor(c,user);
      const [counts]=await c.execute<CountRow[]>('SELECT COUNT(*) AS total FROM driver_documents WHERE user_id=? AND created_at>UTC_TIMESTAMP()-INTERVAL 1 DAY',[user.id]);
      if(counts[0]!.total>=10)fail(429,'LICENSE_LIMIT','Alcanzaste el límite de documentos de hoy.');
      await c.execute('INSERT INTO driver_documents(id,user_id,holder,country,expires_on,front_image,front_type,back_image,back_type) VALUES(?,?,?,?,?,?,?,?,?)',[id,user.id,input.holder,input.country,input.expiry,input.front.bytes,input.front.type,input.back.bytes,input.back.type]);
      return {document:{id,titular:input.holder,pais:input.country,vencimiento:input.expiry,estado:'pendiente'}};
    });
  }
  async documentImage(user:User,id:string,back:boolean) {
    return this.run(()=>this.database.withConnection(async c=>{
      const [rows]=await c.execute<Row[]>('SELECT * FROM driver_documents WHERE id=?',[id]);
      if(!rows[0]||(rows[0].user_id!==user.id&&user.rol!=='administrador'))fail(404,'DOCUMENT_NOT_FOUND','Documento no encontrado.');
      return {bytes:rows[0][back?'back_image':'front_image'] as Buffer,type:String(rows[0][back?'back_type':'front_type'])};
    }));
  }

  async quote(input: ReservationInput) {
    return this.transaction(async (connection) => {
      const vehicle = await lockVehicle(connection, input.vehiculo_id);
      ready(vehicle);
      await location(connection, vehicle.ubicacion_actual_id!);
      await location(connection, input.entrega_id);
      await location(connection, input.devolucion_id);
      if (Date.parse(input.inicio_utc) <= instant(await clock(connection))) fail(400, 'PAST_START', 'La fecha de inicio debe ser futura.');
      await noConflict(connection, input);
      return { ...priceForPeriod(vehicle.precio_dia!, input.inicio_utc, input.fin_utc), inicio_utc: input.inicio_utc, fin_utc: input.fin_utc };
    });
  }

  async create(user: User, input: ReservationInput, key: string) {
    const code = 'AR' + createHash('sha256').update(`${user.id}:${key}`).digest('hex').slice(0, 22).toUpperCase();
    return this.transaction(async (connection) => {
      const vehicle = await lockVehicle(connection, input.vehiculo_id);
      await actor(connection, user);
      const [existing] = await connection.execute<ReservationRow[]>('SELECT * FROM reservas WHERE codigo = ? FOR UPDATE', [code]);
      if (existing[0]) {
        const previous = existing[0];
        if (previous.cliente_id !== user.id || previous.vehiculo_id !== input.vehiculo_id || previous.entrega_id !== input.entrega_id || previous.devolucion_id !== input.devolucion_id || (previous.documento_id||undefined)!==input.documento_id || instant(previous.inicio_utc) !== Date.parse(input.inicio_utc) || instant(previous.fin_utc) !== Date.parse(input.fin_utc)) fail(409, 'IDEMPOTENCY_CONFLICT', 'El identificador de operación ya fue usado con otros datos.');
        return { reservation: await read(connection, previous.id), replayed: true };
      }
      if(!input.documento_id)fail(400,'LICENSE_REQUIRED','Adjunta ambas caras de tu licencia de conducir antes de confirmar.');
      const [documents]=await connection.execute<Row[]>('SELECT id,expires_on,status FROM driver_documents WHERE id=? AND user_id=? FOR SHARE',[input.documento_id,user.id]);
      if(!documents[0])fail(400,'LICENSE_REQUIRED','Adjunta tu licencia de conducir.');
      if(documents[0].status==='rechazado'||String(documents[0].expires_on)<new Date(Date.parse(input.fin_utc)-6*3600000-1).toISOString().slice(0,10))fail(400,'LICENSE_EXPIRED','La licencia debe estar vigente durante toda la reserva.');
      const acceptance = this.legal ? await this.legal.acceptance(input.aceptacion, connection) : undefined;
      ready(vehicle);
      await location(connection, vehicle.ubicacion_actual_id!);
      await location(connection, input.entrega_id);
      await location(connection, input.devolucion_id);
      if (Date.parse(input.inicio_utc) <= instant(await clock(connection))) fail(400, 'PAST_START', 'La fecha de inicio debe ser futura.');
      await noConflict(connection, input);
      const price = priceForPeriod(vehicle.precio_dia!, input.inicio_utc, input.fin_utc);
      if (input.precio_confirmado !== vehicle.precio_dia) fail(409, 'PRICE_CHANGED', 'La tarifa cambió. Consulta nuevamente el total antes de confirmar.');
      const [result] = await connection.execute<ResultSetHeader>(`INSERT INTO reservas
        (codigo, cliente_id, vehiculo_id, entrega_id, devolucion_id, inicio_utc, fin_utc,
        precio_dia_aplicado, unidades_cobradas, total, moneda, documento_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?)`,
      [code, user.id, input.vehiculo_id, input.entrega_id, input.devolucion_id, sqlDate(input.inicio_utc), sqlDate(input.fin_utc), price.precio_dia, price.dias_cobrados, price.total, input.documento_id]);
      if (acceptance) await storeAcceptance(connection, user.id, 'reserva', acceptance, result.insertId);
      await notify(connection, user.id, result.insertId, 'Reserva confirmada', `Tu reserva ${code} fue confirmada. Total USD ${price.total}.`);
      await audit(connection, user, result.insertId, 'confirmed');
      return { reservation: await read(connection, result.insertId), replayed: false };
    });
  }

  async list(user: User, page: number, limit: number, state?: string) {
    return this.run(() => this.database.withConnection(async (connection) => {
      const clauses: string[] = []; const params: Array<string | number> = [];
      if (user.rol !== 'administrador') { clauses.push('r.cliente_id = ?'); params.push(user.id); }
      if (state !== undefined) { clauses.push('r.estado = ?'); params.push(state); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const [rows] = await connection.execute<ReservationRow[]>(`${SELECT} ${where} ORDER BY r.inicio_utc DESC, r.id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
      const [counts] = await connection.execute<CountRow[]>(`SELECT COUNT(*) AS total FROM reservas r ${where}`, params);
      return { reservations: rows.map(present), pagination: { page, limit, total: counts[0]!.total, totalPages: Math.ceil(counts[0]!.total / limit) } };
    }));
  }

  async detail(user: User, id: number) {
    return this.run(() => this.database.withConnection(async (connection) => {
      const row = await read(connection, id);
      if (user.rol !== 'administrador' && row.cliente_id !== user.id) fail(404, 'RESERVATION_NOT_FOUND', 'La reserva no existe.');
      return { reservation: row };
    }));
  }

  async cancel(user: User, id: number, reason: string | null) {
    return this.change(user, id, async (connection, reservation) => {
      if (reservation.estado === 'cancelada') return;
      if (reservation.estado !== 'confirmada') fail(409, 'INVALID_STATE', 'Solo se pueden cancelar reservas confirmadas.');
      const now = await clock(connection);
      if (user.rol !== 'administrador' && instant(now) >= instant(reservation.inicio_utc)) fail(409, 'CANCELLATION_CLOSED', 'El período de cancelación terminó al comenzar la reserva.');
      await connection.execute("UPDATE reservas SET estado = 'cancelada', cancelada_en = ?, motivo_cancelacion = ? WHERE id = ?", [now, reason, id]);
      await notify(connection, reservation.cliente_id, id, 'Reserva cancelada', `La reserva ${reservation.codigo} fue cancelada sin cargo de cancelación.`);
      await audit(connection, user, id, 'cancelled');
    });
  }

  async checkout(user: User, id: number, input: CheckoutInput) {
    return this.change(user, id, async (connection, reservation, vehicle) => {
      if (reservation.estado !== 'confirmada') fail(409, 'INVALID_STATE', 'La reserva debe estar confirmada para entregar el vehículo.');
      if(reservation.documento_id){if(input.licencia_valida!==true)fail(400,'LICENSE_REVIEW_REQUIRED','Revisa ambas caras de la licencia antes de entregar el vehículo.');const [docs]=await connection.execute<Row[]>('SELECT expires_on FROM driver_documents WHERE id=?',[reservation.documento_id]);if(!docs[0]||String(docs[0].expires_on)<new Date(instant(reservation.fin_utc)-6*3600000-1).toISOString().slice(0,10))fail(409,'LICENSE_EXPIRED','La licencia no está vigente para esta reserva.');await connection.execute("UPDATE driver_documents SET status='verificada' WHERE id=?",[reservation.documento_id]);}
      if (vehicle.estado_operativo !== 'operativo') fail(409, 'VEHICLE_UNAVAILABLE', 'El vehículo no está operativo.');
      const now = await clock(connection);
      if (instant(now) < instant(reservation.inicio_utc) || instant(now) >= instant(reservation.fin_utc)) fail(409, 'CHECKOUT_TIME', 'La entrega debe registrarse durante el período reservado.');
      if (vehicle.kilometraje === null || input.kilometraje < vehicle.kilometraje) fail(400, 'INVALID_MILEAGE', 'El kilometraje de salida no puede ser menor que el actual.');
      const [open] = await connection.execute<Row[]>(`SELECT a.id FROM alquileres a JOIN reservas r ON r.id = a.reserva_id WHERE r.vehiculo_id = ? AND a.devolucion_real_utc IS NULL FOR UPDATE`, [reservation.vehiculo_id]);
      if (open.length) fail(409, 'OPEN_RENTAL', 'Este vehículo todavía tiene un alquiler sin devolver.');
      await connection.execute('INSERT INTO alquileres (reserva_id, salida_real_utc, km_salida, entregado_por, observaciones_salida) VALUES (?, ?, ?, ?, ?)', [id, now, input.kilometraje, user.id, input.observaciones]);
      await connection.execute("UPDATE reservas SET estado = 'en_curso' WHERE id = ?", [id]);
      await connection.execute('UPDATE vehiculos SET kilometraje = ? WHERE id = ?', [input.kilometraje, reservation.vehiculo_id]);
      await notify(connection, reservation.cliente_id, id, 'Vehículo entregado', `El alquiler de la reserva ${reservation.codigo} comenzó.`);
      await audit(connection, user, id, 'checked_out');
    }, true);
  }

  async returnVehicle(user: User, id: number, input: ReturnInput) {
    return this.change(user, id, async (connection, reservation) => {
      if (reservation.estado !== 'en_curso') fail(409, 'INVALID_STATE', 'La reserva debe tener un alquiler en curso.');
      const [rentals] = await connection.execute<Row[]>('SELECT id, km_salida FROM alquileres WHERE reserva_id = ? AND devolucion_real_utc IS NULL FOR UPDATE', [id]);
      const rental = rentals[0];
      if (!rental) fail(409, 'RENTAL_NOT_OPEN', 'No hay una entrega abierta para esta reserva.');
      if (input.kilometraje < Number(rental.km_salida)) fail(400, 'INVALID_MILEAGE', 'El kilometraje de devolución no puede ser menor que el de salida.');
      await location(connection, input.ubicacion_id);
      const now = await clock(connection);
      await connection.execute('UPDATE alquileres SET devolucion_real_utc = ?, km_regreso = ?, recibido_por = ?, observaciones_devolucion = ? WHERE id = ?', [now, input.kilometraje, user.id, input.observaciones, rental.id]);
      await connection.execute("UPDATE reservas SET estado = 'completada' WHERE id = ?", [id]);
      await connection.execute('UPDATE vehiculos SET kilometraje = ?, ubicacion_actual_id = ? WHERE id = ?', [input.kilometraje, input.ubicacion_id, reservation.vehiculo_id]);
      await notify(connection, reservation.cliente_id, id, 'Devolución registrada', `La reserva ${reservation.codigo} fue completada. Gracias por elegir AutoRent.`);
      await audit(connection, user, id, 'returned');
    }, true);
  }

  async locations(admin = false) {
    return this.run(() => this.database.withConnection(async (connection) => {
      const [rows] = await connection.execute<Row[]>(`SELECT id, nombre, tipo, direccion, latitud, longitud, activo FROM ubicaciones ${admin ? '' : 'WHERE activo = TRUE'} ORDER BY nombre, id`);
      return { locations: rows.map((row) => ({ ...row, activo: Boolean(row.activo) })) };
    }));
  }
  async saveLocation(input: LocationInput, id?: number) {
    return this.run(() => this.database.withConnection(async (connection) => {
      if (id === undefined) {
        const [result] = await connection.execute<ResultSetHeader>('INSERT INTO ubicaciones (nombre, tipo, direccion, latitud, longitud, activo) VALUES (?, ?, ?, ?, ?, ?)', Object.values(input));
        return { id: result.insertId };
      }
      const [result] = await connection.execute<ResultSetHeader>('UPDATE ubicaciones SET nombre = ?, tipo = ?, direccion = ?, latitud = ?, longitud = ?, activo = ? WHERE id = ?', [...Object.values(input), id]);
      if (!result.affectedRows) fail(404, 'LOCATION_NOT_FOUND', 'La ubicación no existe.');
      return { id };
    }));
  }
  async notifications(userId: number, page: number, limit: number) {
    return this.run(() => this.database.withConnection(async (connection) => {
      const [rows] = await connection.execute<Row[]>('SELECT id, reserva_id, titulo, mensaje, creada_en, leida_en FROM notificaciones WHERE usuario_id = ? ORDER BY id DESC LIMIT ? OFFSET ?', [userId, limit, (page - 1) * limit]);
      const [counts] = await connection.execute<CountRow[]>('SELECT COUNT(*) AS total FROM notificaciones WHERE usuario_id = ? AND leida_en IS NULL', [userId]);
      return { notifications: rows, unread: counts[0]!.total, page, limit };
    }));
  }
  async readNotification(userId: number, id: number) {
    return this.run(() => this.database.withConnection(async (connection) => {
      const [rows] = await connection.execute<Row[]>('SELECT id FROM notificaciones WHERE id = ? AND usuario_id = ?', [id, userId]);
      if (!rows.length) fail(404, 'NOTIFICATION_NOT_FOUND', 'El aviso no existe.');
      await connection.execute('UPDATE notificaciones SET leida_en = COALESCE(leida_en, UTC_TIMESTAMP(6)) WHERE id = ? AND usuario_id = ?', [id, userId]);
      return { id, read: true };
    }));
  }

  private change(user: User, id: number, work: (connection: PoolConnection, reservation: ReservationRow, vehicle: VehicleRow) => Promise<void>, admin = false) {
    return this.transaction(async (connection) => {
      const [initial] = await connection.execute<ReservationRow[]>('SELECT id, vehiculo_id, cliente_id FROM reservas WHERE id = ?', [id]);
      if (!initial[0] || (user.rol !== 'administrador' && initial[0].cliente_id !== user.id)) fail(404, 'RESERVATION_NOT_FOUND', 'La reserva no existe.');
      const vehicle = await lockVehicle(connection, initial[0].vehiculo_id);
      await actor(connection, user, admin || user.rol === 'administrador');
      const [rows] = await connection.execute<ReservationRow[]>('SELECT * FROM reservas WHERE id = ? FOR UPDATE', [id]);
      const reservation = rows[0]!;
      await work(connection, reservation, vehicle);
      return { reservation: await read(connection, id) };
    });
  }
  private transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    return this.run(() => this.database.withConnection(async (connection) => {
      await connection.beginTransaction();
      try { const result = await work(connection); await connection.commit(); return result; }
      catch (error) { await connection.rollback(); throw error; }
    }));
  }
  private async run<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      if (cause instanceof RangeError) fail(400, 'PRICE_LIMIT', 'Revisa la tarifa y la duración de la reserva.');
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : '';
      if (code === 'ER_LOCK_DEADLOCK' || code === 'ER_LOCK_WAIT_TIMEOUT') fail(409, 'RETRY_OPERATION', 'Otra operación está actualizando estos datos. Inténtalo nuevamente con el mismo identificador.');
      if (code === 'ER_DUP_ENTRY') fail(409, 'DUPLICATE_OPERATION', 'La operación ya fue registrada. Consulta el historial antes de repetirla.');
      throw new ApiError(503, 'DATABASE_UNAVAILABLE', 'No se pudo completar la operación. Inténtalo nuevamente.', { cause });
    }
  }
}
