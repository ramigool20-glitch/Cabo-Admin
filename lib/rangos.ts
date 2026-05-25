import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { TZ } from './fechas'

export type RangoId = 'mes_actual' | 'mes_pasado' | 'ultimos_30' | 'año_actual'

export const RANGOS: { id: RangoId; label: string }[] = [
  { id: 'mes_actual', label: 'Este mes' },
  { id: 'mes_pasado', label: 'Mes pasado' },
  { id: 'ultimos_30', label: 'Últimos 30 días' },
  { id: 'año_actual', label: 'Año actual' },
]

export function isRangoId(v: string | null | undefined): v is RangoId {
  return v === 'mes_actual' || v === 'mes_pasado' || v === 'ultimos_30' || v === 'año_actual'
}

export function rangoFechas(rango: RangoId): { desde: string; hasta: string; label: string } {
  const ahora = toZonedTime(new Date(), TZ)
  const año = ahora.getFullYear()
  const mes = ahora.getMonth()

  switch (rango) {
    case 'mes_actual': {
      const desde = new Date(año, mes, 1)
      const hasta = new Date(año, mes + 1, 0)
      return {
        desde: formatInTimeZone(desde, TZ, 'yyyy-MM-dd'),
        hasta: formatInTimeZone(hasta, TZ, 'yyyy-MM-dd'),
        label: formatInTimeZone(desde, TZ, 'MMM yyyy'),
      }
    }
    case 'mes_pasado': {
      const desde = new Date(año, mes - 1, 1)
      const hasta = new Date(año, mes, 0)
      return {
        desde: formatInTimeZone(desde, TZ, 'yyyy-MM-dd'),
        hasta: formatInTimeZone(hasta, TZ, 'yyyy-MM-dd'),
        label: formatInTimeZone(desde, TZ, 'MMM yyyy'),
      }
    }
    case 'ultimos_30': {
      const hasta = ahora
      const desde = new Date(año, mes, ahora.getDate() - 29)
      return {
        desde: formatInTimeZone(desde, TZ, 'yyyy-MM-dd'),
        hasta: formatInTimeZone(hasta, TZ, 'yyyy-MM-dd'),
        label: 'Últimos 30 días',
      }
    }
    case 'año_actual': {
      const desde = new Date(año, 0, 1)
      const hasta = new Date(año, 11, 31)
      return {
        desde: formatInTimeZone(desde, TZ, 'yyyy-MM-dd'),
        hasta: formatInTimeZone(hasta, TZ, 'yyyy-MM-dd'),
        label: String(año),
      }
    }
  }
}
