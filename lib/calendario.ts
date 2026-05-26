import { createAdminClient } from './supabase/admin'

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
  const inicio = new Date(año, mes, 1).toISOString().slice(0, 10)
  const fin = new Date(año, mes + 1, 0).toISOString().slice(0, 10)

  const eventos: EventoCalendario[] = []

  // 1) Gastos fijos con próximo pago en este mes
  const { data: gf } = await admin
    .from('gastos_recurrentes')
    .select('id, nombre, monto, moneda, proximo_pago, dia_del_mes, frecuencia, negocios(nombre)')
    .eq('activo', true)
    .gte('proximo_pago', inicio)
    .lte('proximo_pago', fin)
  for (const g of gf ?? []) {
    const neg = g.negocios as unknown as { nombre: string } | null
    eventos.push({
      fecha: g.proximo_pago!,
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

  // 4) Tareas con fecha límite en este mes
  const { data: tareas } = await admin
    .from('tareas')
    .select('id, titulo, fecha_limite, prioridad, estado, multa_monto, moneda_multa')
    .gte('fecha_limite', `${inicio}T00:00:00`)
    .lte('fecha_limite', `${fin}T23:59:59`)
    .in('estado', ['pendiente', 'en_progreso', 'vencida'])
  for (const t of tareas ?? []) {
    eventos.push({
      fecha: t.fecha_limite.slice(0, 10),
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
    const fecha = m.created_at.slice(0, 10)
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
