import { TZ } from './fechas'
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'

export type Frecuencia = 'mensual' | 'quincenal' | 'semanal' | 'anual'

/**
 * Calcula la próxima fecha de pago a partir de una fecha base.
 */
export function siguientePago(actualISO: string, frecuencia: Frecuencia): string {
  const base = toZonedTime(new Date(actualISO + 'T12:00:00Z'), TZ)
  let proximo = new Date(base)

  switch (frecuencia) {
    case 'mensual':
      proximo.setMonth(proximo.getMonth() + 1)
      break
    case 'quincenal':
      proximo.setDate(proximo.getDate() + 15)
      break
    case 'semanal':
      proximo.setDate(proximo.getDate() + 7)
      break
    case 'anual':
      proximo.setFullYear(proximo.getFullYear() + 1)
      break
  }

  return formatInTimeZone(proximo, TZ, 'yyyy-MM-dd')
}

/**
 * Para un recurrente con día_del_mes específico, computa la próxima fecha tomando
 * en cuenta el día base. Útil para "todos los días 1 del mes".
 */
export function proximoConDiaDelMes(diaDelMes: number, desdeISO: string): string {
  const base = toZonedTime(new Date(desdeISO + 'T12:00:00Z'), TZ)
  const año = base.getFullYear()
  const mes = base.getMonth()

  // Si el día del mes aún no pasó este mes, ese es el próximo
  let candidato = new Date(año, mes, diaDelMes)
  if (candidato <= base) {
    candidato = new Date(año, mes + 1, diaDelMes)
  }
  return formatInTimeZone(candidato, TZ, 'yyyy-MM-dd')
}
