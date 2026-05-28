/**
 * Calcula lo que se le debe a cada empleado en su periodo actual.
 * - Semanal: lunes a domingo de esta semana
 * - Quincenal: 1-15 / 16-fin de mes
 * - Mensual: mes actual
 *
 * Suma: sueldo base + comisiones (% de ventas o servicios clínica) +
 * propinas (enfermera) + bono reviews (enfermera) + extras.
 */
import { hoyEnCabos } from '@/lib/fechas'

export type CompEmpleado = {
  sueldo_base: number
  moneda: string
  comision_porcentaje: number | null
  comision_base: string | null
  frecuencia_pago: 'mensual' | 'quincenal' | 'semanal'
  negocio_id: string | null
}

export type PeriodoPago = { inicio: string; fin: string; label: string }

export function periodoActual(frecuencia: string): PeriodoPago {
  const hoy = hoyEnCabos()
  const d = new Date(hoy + 'T00:00:00')
  const ym = hoy.slice(0, 7)
  const finMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()

  if (frecuencia === 'semanal') {
    // Lunes a domingo
    const dow = d.getDay() // 0=dom
    const diffLunes = dow === 0 ? -6 : 1 - dow
    const lunes = new Date(d)
    lunes.setDate(d.getDate() + diffLunes)
    const domingo = new Date(lunes)
    domingo.setDate(lunes.getDate() + 6)
    const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    return { inicio: fmt(lunes), fin: fmt(domingo), label: `Semana ${fmt(lunes).slice(5)} a ${fmt(domingo).slice(5)}` }
  }
  if (frecuencia === 'quincenal') {
    const dia = Number(hoy.slice(8, 10))
    if (dia <= 15) return { inicio: `${ym}-01`, fin: `${ym}-15`, label: `1-15 ${ym}` }
    return { inicio: `${ym}-16`, fin: `${ym}-${String(finMes).padStart(2, '0')}`, label: `16-${finMes} ${ym}` }
  }
  // mensual
  return { inicio: `${ym}-01`, fin: `${ym}-${String(finMes).padStart(2, '0')}`, label: ym }
}

export type DesglosePago = {
  sueldo: number
  comisiones: number
  propinas: number
  bono: number
  extras: number
  total: number
  periodo: PeriodoPago
}
