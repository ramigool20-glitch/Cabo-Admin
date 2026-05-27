import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { TZ } from './fechas'

export type RangoId =
  | 'hoy'
  | 'ayer'
  | 'ultimos_3'
  | 'ultimos_7'
  | 'ultimos_14'
  | 'ultimos_30'
  | 'ultimos_90'
  | 'mes_actual'
  | 'mes_pasado'
  | 'año_actual'
  | 'año_pasado'
  | 'custom'

export const RANGOS: { id: RangoId; label: string; emoji?: string }[] = [
  { id: 'hoy',         label: 'Hoy',         emoji: '📍' },
  { id: 'ayer',        label: 'Ayer' },
  { id: 'ultimos_3',   label: 'Hace 3 días' },
  { id: 'ultimos_7',   label: '1 semana' },
  { id: 'ultimos_14',  label: '2 semanas' },
  { id: 'ultimos_30',  label: '1 mes' },
  { id: 'ultimos_90',  label: '3 meses' },
  { id: 'mes_actual',  label: 'Este mes' },
  { id: 'mes_pasado',  label: 'Mes pasado' },
  { id: 'año_actual',  label: 'Este año' },
  { id: 'año_pasado',  label: 'Año pasado' },
  { id: 'custom',      label: '🗓️ Custom' },
]

export function isRangoId(v: string | null | undefined): v is RangoId {
  return (
    v === 'hoy' ||
    v === 'ayer' ||
    v === 'ultimos_3' ||
    v === 'ultimos_7' ||
    v === 'ultimos_14' ||
    v === 'ultimos_30' ||
    v === 'ultimos_90' ||
    v === 'mes_actual' ||
    v === 'mes_pasado' ||
    v === 'año_actual' ||
    v === 'año_pasado' ||
    v === 'custom'
  )
}

export type RangoResolved = { desde: string; hasta: string; label: string; id: RangoId }

export function rangoFechas(
  rango: RangoId,
  customDesde?: string | null,
  customHasta?: string | null
): RangoResolved {
  const ahora = toZonedTime(new Date(), TZ)
  const año = ahora.getFullYear()
  const mes = ahora.getMonth()
  const fmtDay = (d: Date) => formatInTimeZone(d, TZ, 'yyyy-MM-dd')

  switch (rango) {
    case 'hoy': {
      const d = fmtDay(ahora)
      return { id: rango, desde: d, hasta: d, label: 'Hoy' }
    }
    case 'ayer': {
      const d = new Date(año, mes, ahora.getDate() - 1)
      return { id: rango, desde: fmtDay(d), hasta: fmtDay(d), label: 'Ayer' }
    }
    case 'ultimos_3': {
      const hasta = ahora
      const desde = new Date(año, mes, ahora.getDate() - 2)
      return { id: rango, desde: fmtDay(desde), hasta: fmtDay(hasta), label: 'Últimos 3 días' }
    }
    case 'ultimos_7': {
      const hasta = ahora
      const desde = new Date(año, mes, ahora.getDate() - 6)
      return { id: rango, desde: fmtDay(desde), hasta: fmtDay(hasta), label: 'Últimos 7 días' }
    }
    case 'ultimos_14': {
      const hasta = ahora
      const desde = new Date(año, mes, ahora.getDate() - 13)
      return { id: rango, desde: fmtDay(desde), hasta: fmtDay(hasta), label: 'Últimos 14 días' }
    }
    case 'mes_actual': {
      const desde = new Date(año, mes, 1)
      const hasta = new Date(año, mes + 1, 0)
      return {
        id: rango,
        desde: fmtDay(desde),
        hasta: fmtDay(hasta),
        label: formatInTimeZone(desde, TZ, 'MMM yyyy'),
      }
    }
    case 'mes_pasado': {
      const desde = new Date(año, mes - 1, 1)
      const hasta = new Date(año, mes, 0)
      return {
        id: rango,
        desde: fmtDay(desde),
        hasta: fmtDay(hasta),
        label: formatInTimeZone(desde, TZ, 'MMM yyyy'),
      }
    }
    case 'ultimos_30': {
      const hasta = ahora
      const desde = new Date(año, mes, ahora.getDate() - 29)
      return { id: rango, desde: fmtDay(desde), hasta: fmtDay(hasta), label: 'Últimos 30 días' }
    }
    case 'ultimos_90': {
      const hasta = ahora
      const desde = new Date(año, mes, ahora.getDate() - 89)
      return { id: rango, desde: fmtDay(desde), hasta: fmtDay(hasta), label: 'Últimos 90 días' }
    }
    case 'año_actual': {
      const desde = new Date(año, 0, 1)
      const hasta = new Date(año, 11, 31)
      return { id: rango, desde: fmtDay(desde), hasta: fmtDay(hasta), label: String(año) }
    }
    case 'año_pasado': {
      const desde = new Date(año - 1, 0, 1)
      const hasta = new Date(año - 1, 11, 31)
      return { id: rango, desde: fmtDay(desde), hasta: fmtDay(hasta), label: String(año - 1) }
    }
    case 'custom': {
      const desde = customDesde && /^\d{4}-\d{2}-\d{2}$/.test(customDesde) ? customDesde : fmtDay(ahora)
      const hasta = customHasta && /^\d{4}-\d{2}-\d{2}$/.test(customHasta) ? customHasta : fmtDay(ahora)
      return { id: rango, desde, hasta, label: `${desde} a ${hasta}` }
    }
  }
}
