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

  let candidato = new Date(año, mes, diaDelMes)
  if (candidato <= base) {
    candidato = new Date(año, mes + 1, diaDelMes)
  }
  return formatInTimeZone(candidato, TZ, 'yyyy-MM-dd')
}

/**
 * Próxima fecha de pago para un empleado según su frecuencia y día de pago.
 * - mensual: dia_de_pago = día del mes (1-31)
 * - quincenal: dia_de_pago = día del mes (típico 15); también paga el día último del mes
 * - semanal: dia_de_pago = día de la semana (1=lun..7=dom). Si no especifica, asume viernes (5)
 */
export function proximaFechaPagoEmpleado(
  frecuencia: 'mensual' | 'quincenal' | 'semanal',
  diaDePago: number | null
): string {
  const hoy = toZonedTime(new Date(), TZ)
  hoy.setHours(0, 0, 0, 0)

  if (frecuencia === 'mensual') {
    const dia = diaDePago ?? 1
    const año = hoy.getFullYear()
    const mes = hoy.getMonth()
    let candidato = new Date(año, mes, dia)
    if (candidato <= hoy) candidato = new Date(año, mes + 1, dia)
    return formatInTimeZone(candidato, TZ, 'yyyy-MM-dd')
  }

  if (frecuencia === 'quincenal') {
    const dia15 = new Date(hoy.getFullYear(), hoy.getMonth(), 15)
    const ultimoDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0) // último día del mes
    if (dia15 > hoy) return formatInTimeZone(dia15, TZ, 'yyyy-MM-dd')
    if (ultimoDelMes > hoy) return formatInTimeZone(ultimoDelMes, TZ, 'yyyy-MM-dd')
    // Si ambos pasaron, el próximo es el 15 del siguiente mes
    return formatInTimeZone(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 15), TZ, 'yyyy-MM-dd')
  }

  // semanal: dia_de_pago como día de la semana (1=lun..7=dom)
  // JS getDay() devuelve 0=dom..6=sab. Convertimos.
  const targetDayJS = (() => {
    if (!diaDePago) return 5 // viernes default
    return diaDePago === 7 ? 0 : diaDePago // 7=dom → 0; 1=lun..6=sab
  })()
  const candidato = new Date(hoy)
  const diff = (targetDayJS - hoy.getDay() + 7) % 7 || 7 // si hoy es el día, próximo es +7
  candidato.setDate(hoy.getDate() + diff)
  return formatInTimeZone(candidato, TZ, 'yyyy-MM-dd')
}
