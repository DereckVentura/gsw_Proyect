export type Period = { inicio_utc: string; fin_utc: string };
export const reservedMessage = 'Las fechas seleccionadas ya están reservadas. Elige otras fechas.';
export const localDay = (time = Date.now()) => new Date(time - 6 * 3600000).toISOString().slice(0, 10);
export function dayIsReserved(day: string, periods: Period[]) {
  const start = Date.parse(day + 'T00:00:00-06:00');
  return periods.some(p => Date.parse(p.inicio_utc) < start + 86400000 && Date.parse(p.fin_utc) > start);
}
export function rangeIsReserved(start: string, end: string, periods: Period[]) {
  return periods.some(p => Date.parse(p.inicio_utc) < Date.parse(end) && Date.parse(p.fin_utc) > Date.parse(start));
}
