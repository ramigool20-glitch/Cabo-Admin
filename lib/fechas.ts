import { formatInTimeZone, toZonedTime } from 'date-fns-tz'

export const TZ = 'America/Mazatlan' // Los Cabos

export function hoyEnCabos(): string {
  return formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd')
}

export function formatearFecha(fecha: string | Date, formato = 'dd MMM yyyy'): string {
  const d = typeof fecha === 'string' ? new Date(fecha + 'T12:00:00') : fecha
  return formatInTimeZone(d, TZ, formato, { locale: undefined })
}

export function inicioDelMesISO(): string {
  const ahora = toZonedTime(new Date(), TZ)
  return formatInTimeZone(new Date(ahora.getFullYear(), ahora.getMonth(), 1), TZ, 'yyyy-MM-dd')
}
