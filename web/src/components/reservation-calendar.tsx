'use client';
import { useState } from 'react';
import { dayIsReserved, localDay, type Period } from '../lib/availability';

export function ReservationCalendar({ periods, value, onChange, disabled = false }: { periods: Period[]; value: string; onChange: (day: string) => void; disabled?: boolean }) {
  const [month, setMonth] = useState(() => (value || localDay()).slice(0, 7));
  const first = new Date(month + '-01T12:00:00Z'), count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  function move(delta: number) { setMonth(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + delta, 1)).toISOString().slice(0, 7)); }
  return <div className="reservation-calendar"><div className="calendar-heading"><button type="button" aria-label="Mes anterior" onClick={() => move(-1)}>‹</button><span aria-live="polite">{first.toLocaleDateString('es-SV', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span><button type="button" aria-label="Mes siguiente" onClick={() => move(1)}>›</button></div><div className="calendar-days">{['D','L','M','M','J','V','S'].map((d,i) => <span key={'w'+i}>{d}</span>)}{Array.from({length:first.getUTCDay()},(_,i)=><span key={'s'+i}/>)}{Array.from({length:count},(_,i)=>{const day=month+'-'+String(i+1).padStart(2,'0'), booked=dayIsReserved(day,periods);return <button type="button" key={day} disabled={disabled||booked||day<localDay()||day>localDay(Date.now()+730*86400000)} aria-label={day+(booked?' · Reservado':'')} aria-pressed={value===day} className={(booked?'booked ':'')+(value===day?'chosen':'')} onClick={()=>onChange(day)}>{i+1}</button>;})}</div><small>Gris: reservado o no disponible</small></div>;
}
