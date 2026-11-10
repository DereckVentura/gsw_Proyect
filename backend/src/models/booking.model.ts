export type ReservationState = 'confirmada' | 'en_curso' | 'completada' | 'cancelada' | 'no_presentado';
export interface ReservationInput {
  vehiculo_id: number;
  entrega_id: number;
  devolucion_id: number;
  inicio_utc: string;
  fin_utc: string;
  precio_confirmado?: string;
  aceptacion?: unknown;
  documento_id?: string;
}
export interface ReturnInput { kilometraje: number; ubicacion_id: number; observaciones: string | null }
export interface CheckoutInput { licencia_valida?: boolean; kilometraje: number; observaciones: string | null }
export interface LocationInput {
  nombre: string;
  tipo: 'sucursal' | 'punto_autorizado';
  direccion: string;
  latitud: string;
  longitud: string;
  activo: boolean;
}

export function priceForPeriod(price: string, start: string, end: string) {
  const milliseconds = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw new RangeError('INVALID_PERIOD');
  const days = Math.ceil(milliseconds / 86_400_000);
  const match = /^(\d{1,8})\.(\d{2})$/.exec(price);
  if (!match) throw new RangeError('INVALID_PRICE');
  const cents = BigInt(match[1]!) * 100n + BigInt(match[2]!);
  const total = cents * BigInt(days);
  if (cents <= 0n || total > 999_999_999_999n || days > 365) throw new RangeError('PRICE_LIMIT');
  return { dias_cobrados: days, precio_dia: price, total: `${total / 100n}.${(total % 100n).toString().padStart(2, '0')}`, moneda: 'USD' as const };
}
