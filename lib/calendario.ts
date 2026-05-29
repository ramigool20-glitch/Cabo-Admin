import { formatInTimeZone } from 'date-fns-tz'
import { createAdminClient } from './supabase/admin'
import { TZ } from './fechas'

type Frecuencia = 'mensual' | 'quincenal' | 'semanal' | 'anual'

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Calcula todas las fechas en que un gasto fijo aplica dentro del mes dado.
 *
 * Reglas:
 * - mensual: el día_del_mes (capeado al último día si dia > diasMes)
 * - quincenal: cada 14 días desde proximo_pago hacia atrás/adelante
 * - semanal: cada 7 días desde proximo_pago hacia atrás/adelante
 * - anual: si el mes y día coincide con proximo_pago
 */
function proyectarOcurrencias(
  frecuencia: Frecuencia,
  diaDelMes: number | null,
  proximoPago: string | null,
  inicioMes: Date,
  finMes: Date,
  ultimoDiaMes: number,
): string[] {
  const occ: string[] = []

  if (frecuencia === 'mensual') {
    const dia = Math.min(diaDelMes ?? 1, ultimoDiaMes)
    const fecha = new Date(inicioMes.getFullYear(), inicioMes.getMonth(), dia)
    if (fecha >= inicioMes && fecha <= finMes) {
      occ.push(ymd(fecha))
    }
    return occ
  }

  if (frecuencia === 'anual') {
    if (!proximoPago) return []
    const ref = new Date(proximoPago + 'T00:00:00')
    if (ref.getMonth() === inicioMes.getMonth()) {
      const dia = Math.min(ref.getDate(), ultimoDiaMes)
      const fecha = new Date(inicioMes.getFullYear(), inicioMes.getMonth(), dia)
      occ.push(ymd(fecha))
    }
    return occ
  }

  // Quincenal / semanal: necesitan un anclaje (proximo_pago)
  if (!proximoPago) return []
  const intervalo = frecuencia === 'quincenal' ? 14 : 7
  const ref = new Date(proximoPago + 'T00:00:00')

  // Caminar HACIA ATRÁS desde ref hasta antes de inicioMes
  let d = new Date(ref)
  while (d > finMes) {
    d.setDate(d.getDate() - intervalo)
  }
  while (d > inicioMes) {
    const prev = new Date(d)
    prev.setDate(prev.getDate() - intervalo)
    d = prev
  }
  // Avanzar añadiendo todas las ocurrencias dentro del mes
  while (d <= finMes) {
    if (d >= inicioMes) occ.push(ymd(d))
    const next = new Date(d)
    next.setDate(next.getDate() + intervalo)
    d = next
  }
  return Array.from(new Set(occ)).sort()
}

export type EventoCalendario = {
  fecha: string                  // YYYY-MM-DD
  tipo: 'gasto_fijo' | 'evento' | 'cuenta_por_pagar' | 'tarea' | 'nomina' | 'multa'
  titulo: string
  monto?: number
  moneda?: 'MXN' | 'USD'
  estado?: string
  negocio?: string | null
  link: string                   // a dónde ir al hacer tap
  emoji: string
  color: string                  // tailwind text-COLOR
}

/**
 * Junta TODOS los eventos del mes desde múltiples tablas.
 */
export async function eventosDelMes(año: number, mes: number): Promise<EventoCalendario[]> {
  const admin = createAdminClient()
  const mm = String(mes + 1).padStart(2, '0')
  const ultimoDiaDelMes = new Date(año, mes + 1, 0).getDate()
  const inicio = `${año}-${mm}-01`
  const fin = `${año}-${mm}-${String(ultimoDiaDelMes).padStart(2, '0')}`

  const eventos: EventoCalendario[] = []

  // 1) Gastos fijos — PROYECTAR todas las ocurrencias del mes basadas en frecuencia
  const { data: gf } = await admin
    .from('gastos_recurrentes')
    .select('id, nombre, monto, moneda, proximo_pago, dia_del_mes, frecuencia, negocios(nombre)')
    .eq('activo', true)
  const ultimoDiaMes = new Date(año, mes + 1, 0).getDate()
  const inicioDate = new Date(año, mes, 1)
  const finDate = new Date(año, mes + 1, 0)
  for (const g of gf ?? []) {
    const neg = g.negocios as unknown as { nombre: string } | null
    const ocurrencias = proyectarOcurrencias(
      g.frecuencia as Frecuencia,
      g.dia_del_mes as number | null,
      g.proximo_pago as string | null,
      inicioDate,
      finDate,
      ultimoDiaMes,
    )
    for (const fecha of ocurrencias) {
      eventos.push({
        fecha,
        tipo: 'gasto_fijo',
        titulo: g.nombre,
        monto: Number(g.monto),
        moneda: g.moneda as 'MXN' | 'USD',
        negocio: neg?.nombre ?? null,
        link: `/recurrentes/${g.id}`,
        emoji: '📅',
        color: 'text-blue-400',
      })
    }
  }

  // 2) Eventos Rancho McCoy
  const { data: ev } = await admin
    .from('eventos')
    .select('id, cliente_nombre, tipo_evento, fecha_evento, monto_total, moneda, estado')
    .gte('fecha_evento', inicio)
    .lte('fecha_evento', fin)
    .neq('estado', 'cancelado')
  for (const e of ev ?? []) {
    eventos.push({
      fecha: e.fecha_evento,
      tipo: 'evento',
      titulo: `${e.cliente_nombre}${e.tipo_evento ? ' · ' + e.tipo_evento : ''}`,
      monto: Number(e.monto_total),
      moneda: e.moneda as 'MXN' | 'USD',
      estado: e.estado,
      link: `/eventos/${e.id}`,
      emoji: '🎉',
      color: 'text-pink-400',
    })
  }

  // 3) Cuentas por pagar (vencimientos en este mes)
  const { data: cpp } = await admin
    .from('cuentas_por_pagar')
    .select('id, proveedor, concepto, monto_total, monto_pagado, moneda, fecha_vencimiento, estado, negocios(nombre)')
    .gte('fecha_vencimiento', inicio)
    .lte('fecha_vencimiento', fin)
    .neq('estado', 'cancelado')
    .neq('estado', 'pagado')
  for (const c of cpp ?? []) {
    if (!c.fecha_vencimiento) continue
    const neg = c.negocios as unknown as { nombre: string } | null
    eventos.push({
      fecha: c.fecha_vencimiento,
      tipo: 'cuenta_por_pagar',
      titulo: `${c.proveedor} · ${c.concepto}`,
      monto: Number(c.monto_total) - Number(c.monto_pagado),
      moneda: c.moneda as 'MXN' | 'USD',
      estado: c.estado,
      negocio: neg?.nombre ?? null,
      link: `/por-pagar/${c.id}`,
      emoji: '💸',
      color: 'text-rose-400',
    })
  }

  // 4) Tareas con fecha límite en este mes (fecha en hora de Cabo, no UTC).
  // Ampliamos la ventana ±1 día para no perder tareas del borde por el desfase de zona.
  const prevDia = new Date(año, mes, 0).toISOString().slice(0, 10)      // último día del mes anterior
  const nextDia = new Date(año, mes + 1, 2).toISOString().slice(0, 10)  // 2 del mes siguiente
  const { data: tareas } = await admin
    .from('tareas')
    .select('id, titulo, fecha_limite, prioridad, estado, multa_monto, moneda_multa')
    .gte('fecha_limite', `${prevDia}T00:00:00`)
    .lte('fecha_limite', `${nextDia}T23:59:59`)
    .in('estado', ['pendiente', 'en_progreso', 'vencida'])
  for (const t of tareas ?? []) {
    const fechaCabo = formatInTimeZone(new Date(t.fecha_limite), TZ, 'yyyy-MM-dd')
    if (fechaCabo < inicio || fechaCabo > fin) continue
    eventos.push({
      fecha: fechaCabo,
      tipo: 'tarea',
      titulo: t.titulo,
      monto: t.multa_monto ? Number(t.multa_monto) : undefined,
      moneda: t.moneda_multa as 'MXN' | 'USD',
      estado: t.estado,
      link: '/tareas',
      emoji: '✅',
      color: 'text-amber-400',
    })
  }

  // 5) Multas pendientes
  const { data: multas } = await admin
    .from('multas')
    .select('id, motivo, monto_propuesto, moneda, estado, created_at')
    .in('estado', ['propuesta', 'justificada', 'reduccion_solicitada', 'pendiente_conversacion'])
  for (const m of multas ?? []) {
    const fecha = formatInTimeZone(new Date(m.created_at), TZ, 'yyyy-MM-dd')
    if (fecha < inicio || fecha > fin) continue
    eventos.push({
      fecha,
      tipo: 'multa',
      titulo: m.motivo,
      monto: Number(m.monto_propuesto),
      moneda: m.moneda as 'MXN' | 'USD',
      estado: m.estado,
      link: '/multas',
      emoji: '⚠️',
      color: 'text-rose-400',
    })
  }

  // Ordenar por fecha
  return eventos.sort((a, b) => a.fecha.localeCompare(b.fecha))
}
