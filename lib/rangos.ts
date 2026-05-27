import { formatInTimeZone } from 'date-fns-tz'
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

/**
 * BUG FIX (TZ): los servers Vercel corren en UTC. La función anterior usaba
 * toZonedTime + Date local methods, lo que producía fechas incorrectas cerca
 * de medianoche en Cabo. Ahora derivamos hoy de formatInTimeZone y hacemos
 * aritmética con componentes puros (sin Date.getXxx() que depende del TZ).
 */
export function rangoFechas(
  rango: RangoId,
  customDesde?: string | null,
  customHasta?: string | null
): RangoResolved {
  // Hoy en Cabo, extraído del TZ correcto
  const hoyStr = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd')
  const [hoyY, hoyM, hoyD] = hoyStr.split('-').map(Number)

  // Construye una Date "naive" con esos componentes (NO importa el TZ del server)
  const cabosDate = (y: number, mIdx0: number, d: number) => new Date(y, mIdx0, d)
  const today = cabosDate(hoyY, hoyM - 1, hoyD)

  const ymd = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const monthLabel = (y: number, mIdx0: number) => {
    const date = new Date(y, mIdx0, 15)
    return date.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })
  }

  switch (rango) {
    case 'hoy': {
      const d = ymd(today)
      return { id: rango, desde: d, hasta: d, label: 'Hoy' }
    }
    case 'ayer': {
      const ayer = new Date(today)
      ayer.setDate(today.getDate() - 1)
      const d = ymd(ayer)
      return { id: rango, desde: d, hasta: d, label: 'Ayer' }
    }
    case 'ultimos_3': {
      const desde = new Date(today)
      desde.setDate(today.getDate() - 2)
      return { id: rango, desde: ymd(desde), hasta: ymd(today), label: 'Últimos 3 días' }
    }
    case 'ultimos_7': {
      const desde = new Date(today)
      desde.setDate(today.getDate() - 6)
      return { id: rango, desde: ymd(desde), hasta: ymd(today), label: 'Últimos 7 días' }
    }
    case 'ultimos_14': {
      const desde = new Date(today)
      desde.setDate(today.getDate() - 13)
      return { id: rango, desde: ymd(desde), hasta: ymd(today), label: 'Últimos 14 días' }
    }
    case 'ultimos_30': {
      const desde = new Date(today)
      desde.setDate(today.getDate() - 29)
      return { id: rango, desde: ymd(desde), hasta: ymd(today), label: 'Últimos 30 días' }
    }
    case 'ultimos_90': {
      const desde = new Date(today)
      desde.setDate(today.getDate() - 89)
      return { id: rango, desde: ymd(desde), hasta: ymd(today), label: 'Últimos 90 días' }
    }
    case 'mes_actual': {
      const desde = cabosDate(hoyY, hoyM - 1, 1)
      const fin = cabosDate(hoyY, hoyM, 0)
      return { id: rango, desde: ymd(desde), hasta: ymd(fin), label: monthLabel(hoyY, hoyM - 1) }
    }
    case 'mes_pasado': {
      const desde = cabosDate(hoyY, hoyM - 2, 1)
      const fin = cabosDate(hoyY, hoyM - 1, 0)
      return { id: rango, desde: ymd(desde), hasta: ymd(fin), label: monthLabel(hoyY, hoyM - 2) }
    }
    case 'año_actual': {
      const desde = cabosDate(hoyY, 0, 1)
      const fin = cabosDate(hoyY, 11, 31)
      return { id: rango, desde: ymd(desde), hasta: ymd(fin), label: String(hoyY) }
    }
    case 'año_pasado': {
      const desde = cabosDate(hoyY - 1, 0, 1)
      const fin = cabosDate(hoyY - 1, 11, 31)
      return { id: rango, desde: ymd(desde), hasta: ymd(fin), label: String(hoyY - 1) }
    }
    case 'custom': {
      const desde = customDesde && /^\d{4}-\d{2}-\d{2}$/.test(customDesde) ? customDesde : hoyStr
      const hasta = customHasta && /^\d{4}-\d{2}-\d{2}$/.test(customHasta) ? customHasta : hoyStr
      return { id: rango, desde, hasta, label: `${desde} a ${hasta}` }
    }
  }
}
