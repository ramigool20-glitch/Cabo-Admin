import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { TZ } from './fechas'

export type RangoId =
  | 'hoy'
  | 'ultimos_7'
  | 'mes_actual'
  | 'mes_pasado'
  | 'ultimos_30'
  | 'año_actual'
  | 'custom'

export const RANGOS: { id: RangoId; label: string }[] = [
  { id: 'hoy',         label: 'Hoy' },
  { id: 'ultimos_7',   label: 'Semana' },
  { id: 'ultimos_30',  label: '30 días' },
  { id: 'mes_actual',  label: 'Este mes' },
  { id: 'mes_pasado',  label: 'Mes pasado' },
  { id: 'año_actual',  label: 'Año' },
  { id: 'custom',      label: 'Custom' },
]

export function isRangoId(v: string | null | undefined): v is RangoId {
  return (
    v === 'hoy' ||
    v === 'ultimos_7' ||
    v === 'mes_actual' ||
    v === 'mes_pasado' ||
    v === 'ultimos_30' ||
    v === 'año_actual' ||
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
    case 'ultimos_7': {
      const hasta = ahora
      const desde = new Date(año, mes, ahora.getDate() - 6)
      return { id: rango, desde: fmtDay(desde), hasta: fmtDay(hasta), label: 'Últimos 7 días' }
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
    case 'año_actual': {
      const desde = new Date(año, 0, 1)
      const hasta = new Date(año, 11, 31)
      return { id: rango, desde: fmtDay(desde), hasta: fmtDay(hasta), label: String(año) }
    }
    case 'custom': {
      const desde = customDesde && /^\d{4}-\d{2}-\d{2}$/.test(customDesde) ? customDesde : fmtDay(ahora)
      const hasta = customHasta && /^\d{4}-\d{2}-\d{2}$/.test(customHasta) ? customHasta : fmtDay(ahora)
      return { id: rango, desde, hasta, label: `${desde} a ${hasta}` }
    }
  }
}
