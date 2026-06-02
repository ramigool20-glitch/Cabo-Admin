/**
 * Proyección de flujo de efectivo 30/60/90 días.
 *
 * Fuentes (todas reales, NADA inventado):
 * - Saldo actual: lib/saldos.calcularSaldos
 * - gastos_recurrentes (activos) → iterar próximos vencimientos por frecuencia
 * - cuentas_por_pagar (pendientes) → fecha_vencimiento futura
 * - cuentas_por_cobrar (pendientes) → fecha_vencimiento futura
 * - cobros_stripe (pendientes) → expira_at futura
 *
 * Devuelve eventos día a día y detecta primer día con saldo proyectado < 0.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularSaldos, fechaSaldoMasAntigua, type CuentaConSaldoInicial, type TxParaSaldo } from '@/lib/saldos'
import { hoyEnCabos } from '@/lib/fechas'

export type CashflowEvent = {
  fecha: string
  tipo: 'gasto_recurrente' | 'cuenta_por_pagar' | 'cuenta_por_cobrar' | 'cobro_stripe'
  concepto: string
  monto_mxn: number      // negativo si salida, positivo si entrada
  cuenta_id: string | null
  ref_id: string
}

export type CashflowForecast = {
  saldo_actual_mxn: number
  ventana_dias: number
  hoy: string
  eventos: CashflowEvent[]
  proyeccion_diaria: Array<{ fecha: string; saldo_mxn: number; eventos_dia: number }>
  hueco_alerta: { fecha: string; saldo_mxn: number; dias_a_partir_de_hoy: number } | null
  resumen: {
    entradas_30d: number; salidas_30d: number; neto_30d: number; final_30d: number
    entradas_60d: number; salidas_60d: number; neto_60d: number; final_60d: number
    entradas_90d: number; salidas_90d: number; neto_90d: number; final_90d: number
  }
  /** Promedios diarios de los últimos 30 días reales — contexto, no se aplica al cálculo. */
  promedio_historico: {
    ventana_dias: number
    entradas_diarias_mxn: number
    salidas_diarias_mxn: number
    neto_diario_mxn: number
  }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Genera próximos vencimientos de un recurrente dentro de la ventana. */
function expandirRecurrente(
  proximoPago: string,
  frecuencia: 'semanal' | 'quincenal' | 'mensual',
  ventanaHasta: string,
  diaDelMes: number | null,
): string[] {
  const out: string[] = []
  let cursor = proximoPago
  let safety = 0
  while (cursor <= ventanaHasta && safety < 200) {
    out.push(cursor)
    safety++
    if (frecuencia === 'semanal') cursor = addDays(cursor, 7)
    else if (frecuencia === 'quincenal') cursor = addDays(cursor, 14)
    else if (frecuencia === 'mensual') {
      // Avanza un mes manteniendo el día (o último día del mes si no existe)
      const d = new Date(cursor + 'T12:00:00')
      const dia = diaDelMes ?? d.getDate()
      d.setMonth(d.getMonth() + 1)
      // Ajustar día (si el mes destino tiene menos días, usar el último)
      const ultimoDelMesDestino = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
      d.setDate(Math.min(dia, ultimoDelMesDestino))
      cursor = d.toISOString().slice(0, 10)
    } else break
  }
  return out
}

export async function proyectarCashFlow(opts: {
  admin: SupabaseClient
  dias?: number
}): Promise<CashflowForecast> {
  const ventana = opts.dias ?? 90
  const admin = opts.admin
  const hoy = hoyEnCabos()
  const ventanaHasta = addDays(hoy, ventana)

  // ── 1) Saldo actual agregado ─────────────────────────────────────
  const [cuentasRes, fxRes] = await Promise.all([
    admin.from('cuentas')
      .select('id, nombre, titular, tipo, moneda, saldo_inicial_mxn, saldo_inicial_usd, saldo_inicial_fecha, saldo_inicial_locked, saldo_inicial_notas')
      .eq('activo', true),
    admin.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
  ])
  const cuentas = (cuentasRes.data ?? []) as CuentaConSaldoInicial[]
  const fxRate = fxRes.data ? Number(fxRes.data.rate_compra) : 17
  const desdeTx = fechaSaldoMasAntigua(cuentas)
  const { data: txs } = await admin
    .from('transacciones')
    .select('tipo, monto, moneda, cuenta_id, fecha')
    .gte('fecha', desdeTx)
    .lte('fecha', hoy)
  const saldos = calcularSaldos(cuentas, (txs ?? []) as TxParaSaldo[], fxRate)
  const saldoActual = saldos.total_mxn

  // ── 2) Eventos futuros ───────────────────────────────────────────
  const eventos: CashflowEvent[] = []

  // Gastos recurrentes
  const { data: recurrentes } = await admin
    .from('gastos_recurrentes')
    .select('id, nombre, monto, moneda, frecuencia, proximo_pago, dia_del_mes, cuenta_id')
    .eq('activo', true)
  for (const r of recurrentes ?? []) {
    if (!r.proximo_pago) continue
    const ocurrencias = expandirRecurrente(r.proximo_pago, r.frecuencia, ventanaHasta, r.dia_del_mes)
    const mxn = r.moneda === 'USD' ? Number(r.monto) * fxRate : Number(r.monto)
    for (const fecha of ocurrencias) {
      if (fecha < hoy) continue
      eventos.push({
        fecha,
        tipo: 'gasto_recurrente',
        concepto: r.nombre,
        monto_mxn: -mxn,
        cuenta_id: r.cuenta_id,
        ref_id: r.id,
      })
    }
  }

  // Cuentas por pagar (pendientes con vencimiento futuro)
  const { data: cpp } = await admin
    .from('cuentas_por_pagar')
    .select('id, concepto, proveedor, monto_total, monto_pagado, moneda, fecha_vencimiento, estado')
    .neq('estado', 'pagada')
    .gte('fecha_vencimiento', hoy)
    .lte('fecha_vencimiento', ventanaHasta)
  for (const c of cpp ?? []) {
    const pendiente = Number(c.monto_total) - Number(c.monto_pagado ?? 0)
    if (pendiente <= 0) continue
    const mxn = c.moneda === 'USD' ? pendiente * fxRate : pendiente
    eventos.push({
      fecha: c.fecha_vencimiento,
      tipo: 'cuenta_por_pagar',
      concepto: `${c.concepto}${c.proveedor ? ' · ' + c.proveedor : ''}`,
      monto_mxn: -mxn,
      cuenta_id: null,
      ref_id: c.id,
    })
  }

  // Cuentas por cobrar (pendientes)
  const { data: cpc } = await admin
    .from('cuentas_por_cobrar')
    .select('id, concepto, cliente_nombre, monto_total, monto_cobrado, moneda, fecha_vencimiento, estado')
    .neq('estado', 'cobrada')
    .gte('fecha_vencimiento', hoy)
    .lte('fecha_vencimiento', ventanaHasta)
  for (const c of cpc ?? []) {
    const pendiente = Number(c.monto_total) - Number(c.monto_cobrado ?? 0)
    if (pendiente <= 0) continue
    const mxn = c.moneda === 'USD' ? pendiente * fxRate : pendiente
    eventos.push({
      fecha: c.fecha_vencimiento,
      tipo: 'cuenta_por_cobrar',
      concepto: `${c.concepto}${c.cliente_nombre ? ' · ' + c.cliente_nombre : ''}`,
      monto_mxn: mxn,
      cuenta_id: null,
      ref_id: c.id,
    })
  }

  // Cobros Stripe pendientes (asumimos cobro estimado en expira_at, o created_at + 7d si no hay)
  const { data: stripeP } = await admin
    .from('cobros_stripe')
    .select('id, descripcion, cliente_nombre, monto, moneda, estado, expira_at, created_at')
    .eq('estado', 'pendiente')
  for (const c of stripeP ?? []) {
    const fechaEst = (c.expira_at ?? c.created_at ?? hoy).slice(0, 10)
    if (fechaEst < hoy || fechaEst > ventanaHasta) continue
    const mxn = c.moneda === 'USD' ? Number(c.monto) * fxRate : Number(c.monto)
    eventos.push({
      fecha: fechaEst,
      tipo: 'cobro_stripe',
      concepto: `Stripe · ${c.descripcion ?? c.cliente_nombre ?? 'cobro'}`,
      monto_mxn: mxn,
      cuenta_id: null,
      ref_id: c.id,
    })
  }

  // Orden cronológico
  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha))

  // ── 3) Proyección día a día ──────────────────────────────────────
  const eventosPorDia = new Map<string, CashflowEvent[]>()
  for (const e of eventos) {
    const arr = eventosPorDia.get(e.fecha) ?? []
    arr.push(e)
    eventosPorDia.set(e.fecha, arr)
  }

  const proyeccion: CashflowForecast['proyeccion_diaria'] = []
  let saldoCorriendo = saldoActual
  let huecoAlerta: CashflowForecast['hueco_alerta'] = null
  for (let i = 0; i <= ventana; i++) {
    const fecha = addDays(hoy, i)
    const evDia = eventosPorDia.get(fecha) ?? []
    const deltaDia = evDia.reduce((s, e) => s + e.monto_mxn, 0)
    saldoCorriendo += deltaDia
    proyeccion.push({ fecha, saldo_mxn: saldoCorriendo, eventos_dia: evDia.length })
    if (!huecoAlerta && saldoCorriendo < 0) {
      huecoAlerta = { fecha, saldo_mxn: saldoCorriendo, dias_a_partir_de_hoy: i }
    }
  }

  // ── 4) Resumen 30/60/90 ──────────────────────────────────────────
  const resumenWin = (n: number) => {
    const limit = addDays(hoy, n)
    let entradas = 0, salidas = 0
    for (const e of eventos) {
      if (e.fecha > limit) break
      if (e.monto_mxn > 0) entradas += e.monto_mxn
      else salidas += Math.abs(e.monto_mxn)
    }
    const final = proyeccion.find((p) => p.fecha === limit)?.saldo_mxn ?? saldoCorriendo
    return { entradas, salidas, neto: entradas - salidas, final }
  }
  const r30 = resumenWin(30)
  const r60 = resumenWin(60)
  const r90 = resumenWin(90)

  // ── 5) Promedio histórico últimos 30d (contexto, no entra al cálculo) ──
  const desdeHist = addDays(hoy, -30)
  const { data: txHist } = await admin
    .from('transacciones')
    .select('tipo, monto, moneda, fecha, monto_mxn_equivalente')
    .gte('fecha', desdeHist)
    .lt('fecha', hoy)
  let entradasHist = 0, salidasHist = 0
  for (const t of txHist ?? []) {
    const mxn = Number(t.monto_mxn_equivalente ?? (t.moneda === 'USD' ? Number(t.monto) * fxRate : Number(t.monto)))
    if (t.tipo === 'ingreso') entradasHist += mxn
    else if (t.tipo === 'gasto' || t.tipo === 'multa_interna') salidasHist += mxn
  }
  const dias = 30
  const entradasDiarias = entradasHist / dias
  const salidasDiarias = salidasHist / dias

  return {
    saldo_actual_mxn: saldoActual,
    ventana_dias: ventana,
    hoy,
    eventos,
    proyeccion_diaria: proyeccion,
    hueco_alerta: huecoAlerta,
    resumen: {
      entradas_30d: r30.entradas, salidas_30d: r30.salidas, neto_30d: r30.neto, final_30d: r30.final,
      entradas_60d: r60.entradas, salidas_60d: r60.salidas, neto_60d: r60.neto, final_60d: r60.final,
      entradas_90d: r90.entradas, salidas_90d: r90.salidas, neto_90d: r90.neto, final_90d: r90.final,
    },
    promedio_historico: {
      ventana_dias: dias,
      entradas_diarias_mxn: entradasDiarias,
      salidas_diarias_mxn: salidasDiarias,
      neto_diario_mxn: entradasDiarias - salidasDiarias,
    },
  }
}
