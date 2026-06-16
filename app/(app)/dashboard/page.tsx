import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Plus, ChevronRight, Sparkles, AlertCircle, DollarSign } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha, hoyEnCabos } from '@/lib/fechas'
import { isRangoId, rangoFechas, type RangoId } from '@/lib/rangos'
import { totalizar, porDia, porNegocio } from '@/lib/agregaciones'
import { desglosarCategorias } from '@/lib/categorias-grupos'
import { calcularSaldos, fechaSaldoMasAntigua, type CuentaConSaldoInicial, type TxParaSaldo } from '@/lib/saldos'
import { dispararPushesProgramados } from '@/lib/push/scheduler'
import { RangoSelector } from '@/components/dashboard/rango-selector'
import { UtilidadChart } from '@/components/dashboard/utilidad-chart'
import { NegociosBar } from '@/components/dashboard/negocios-bar'
import { AnalisisCategorias } from '@/components/transacciones/analisis-categorias'
import { CollapsibleSection } from '@/components/dashboard/collapsible-section'
import { FxMiniWidget } from '@/components/dashboard/fx-mini-widget'
import { CashflowForecastCard } from '@/components/dashboard/cashflow-forecast-card'
import { proyectarCashFlow } from '@/lib/cashflow/forecast'
import { ResumenSemanalCard, type ResumenSemanalRow } from '@/components/dashboard/resumen-semanal-card'
import { CobrosPendientesCard } from '@/components/dashboard/cobros-pendientes-card'
import { InventarioCard, type InventarioResumen } from '@/components/dashboard/inventario-card'

type SearchParams = { rango?: string; desde?: string; hasta?: string }

export default async function DashboardPage(
  { searchParams }: { searchParams: Promise<SearchParams> }
) {
  const sp = await searchParams
  const rangoId: RangoId = isRangoId(sp.rango) ? sp.rango : 'hoy'
  const r = rangoFechas(rangoId, sp.desde, sp.hasta)
  const hoy = hoyEnCabos()

  const supabase = await createClient()
  const admin = createAdminClient()

  // Disparar pushes programados (best-effort, no bloquea render)
  dispararPushesProgramados().catch(() => {})

  // En 7 días desde hoy
  const en7Dias = new Date(new Date(hoy + 'T00:00:00').getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  // Mes anterior para comparativo (mismo número de días que el rango actual)
  const desdeDate = new Date(r.desde + 'T00:00:00')
  const hastaDate = new Date(r.hasta + 'T00:00:00')
  const duracionMs = hastaDate.getTime() - desdeDate.getTime()
  const previoHasta = new Date(desdeDate.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const previoDesde = new Date(desdeDate.getTime() - 24 * 60 * 60 * 1000 - duracionMs).toISOString().slice(0, 10)

  const [
    { data: transacciones },
    { data: negocios },
    { data: ultimas },
    { count: nTareas },
    { count: nPendientes },
    { count: nMultas },
    { data: eventosProx },
    { data: porPagarRows },
    { data: porCobrarRows },
    { data: eventosPendRows },
    { data: fxRateHoy },
    { data: fxHistorial },
    { data: gastosFijosProx },
    { data: porPagarProx },
    { data: txPrevio },
  ] = await Promise.all([
    supabase
      .from('transacciones')
      .select('tipo, monto, moneda, fecha, categoria, concepto, negocio_id, metodo_pago, monto_mxn_equivalente, tipo_cambio_usado')
      .gte('fecha', r.desde)
      .lte('fecha', r.hasta),
    supabase.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
    supabase
      .from('transacciones')
      .select('id, tipo, monto, moneda, fecha, concepto, monto_mxn_equivalente, negocios(nombre)')
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('tareas')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['pendiente', 'en_progreso', 'vencida']),
    admin
      .from('auditor_pendientes')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'abierta'),
    admin
      .from('multas')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['propuesta', 'justificada', 'reduccion_solicitada', 'pendiente_conversacion']),
    supabase
      .from('eventos')
      .select('id, cliente_nombre, fecha_evento, monto_total, moneda')
      .gte('fecha_evento', new Date().toISOString().slice(0, 10))
      .in('estado', ['reservado', 'confirmado'])
      .order('fecha_evento', { ascending: true })
      .limit(3),
    supabase
      .from('cuentas_por_pagar')
      .select('monto_total, monto_pagado, moneda, fecha_vencimiento, estado')
      .neq('estado', 'cancelado')
      .neq('estado', 'pagado'),
    supabase
      .from('cuentas_por_cobrar')
      .select('monto_total, monto_cobrado, moneda, fecha_vencimiento, estado')
      .neq('estado', 'cancelado')
      .neq('estado', 'cobrado'),
    // Eventos con pendiente (para Por Cobrar)
    supabase
      .from('eventos')
      .select('id, monto_total, moneda, fecha_evento, estado, eventos_pagos(monto)')
      .in('estado', ['reservado', 'confirmado']),
    // Rate de hoy
    admin
      .from('fx_rates')
      .select('fecha, rate_compra, source, manual')
      .eq('fecha', hoy)
      .maybeSingle(),
    // Últimos 7 días de rates para el sparkline
    admin
      .from('fx_rates')
      .select('fecha, rate_compra')
      .order('fecha', { ascending: false })
      .limit(7),
    // Gastos fijos con vencimiento en los próximos 7 días
    admin
      .from('gastos_recurrentes')
      .select('id, nombre, monto, moneda, proximo_pago, negocios(nombre)')
      .eq('activo', true)
      .gte('proximo_pago', hoy)
      .lte('proximo_pago', en7Dias)
      .order('proximo_pago', { ascending: true })
      .limit(5),
    // Por pagar próximos a vencer en 7 días
    admin
      .from('cuentas_por_pagar')
      .select('id, proveedor, concepto, monto_total, monto_pagado, moneda, fecha_vencimiento, negocios(nombre)')
      .in('estado', ['pendiente', 'parcial'])
      .gte('fecha_vencimiento', hoy)
      .lte('fecha_vencimiento', en7Dias)
      .order('fecha_vencimiento', { ascending: true })
      .limit(5),
    // Transacciones del periodo anterior para comparativo
    supabase
      .from('transacciones')
      .select('tipo, monto, moneda, fecha, categoria, negocio_id, monto_mxn_equivalente')
      .gte('fecha', previoDesde)
      .lte('fecha', previoHasta),
  ])

  // Cobros MP entrados automático sin categorizar (negocio o categoría faltantes)
  const { data: cobrosPendRows } = await admin
    .from('transacciones')
    .select('id, monto, moneda, concepto, fecha, cuentas(nombre)')
    .eq('metodo_captura', 'api')
    .or('negocio_id.is.null,categoria.is.null')
    .order('fecha', { ascending: false })
    .limit(20)
  const cobrosPendientes = (cobrosPendRows ?? []).map((r) => ({
    id: r.id as string,
    monto: Number(r.monto),
    moneda: r.moneda as 'MXN' | 'USD',
    concepto: r.concepto as string | null,
    fecha: r.fecha as string,
    cuenta_nombre: (r.cuentas as unknown as { nombre: string } | null)?.nombre ?? null,
  }))

  // Resumen de inventario (defensivo: si la tabla aún no existe, salta)
  let inventarioResumen: InventarioResumen | null = null
  try {
    // Intento con costo_mxn (migración 0041); si falla, fallback sin esa col
    const colsExt = 'precio_mxn, stock, stock_minimo, costo_mxn'
    const colsBase = 'precio_mxn, stock, stock_minimo'
    type InvRow = { precio_mxn?: number | null; stock?: number | null; stock_minimo?: number | null; costo_mxn?: number | null }
    let invRows: InvRow[] | null = null
    const r1 = await admin
      .from('inventario_productos')
      .select(colsExt)
      .eq('activo', true)
    if (r1.error) {
      const r2 = await admin
        .from('inventario_productos')
        .select(colsBase)
        .eq('activo', true)
      invRows = (r2.data ?? null) as unknown as InvRow[] | null
    } else {
      invRows = (r1.data ?? null) as unknown as InvRow[] | null
    }
    if (invRows && invRows.length > 0) {
      let valorMxn = 0
      let costoMxn = 0
      let valorConCosto = 0
      let conCosto = 0
      let bajo = 0
      let cero = 0
      for (const p of invRows) {
        const precio = Number(p.precio_mxn ?? 0)
        const stock = Number(p.stock ?? 0)
        const minimo = Number(p.stock_minimo ?? 3)
        const costo = p.costo_mxn != null ? Number(p.costo_mxn) : null
        valorMxn += precio * stock
        if (costo != null && costo > 0) {
          costoMxn += costo * stock
          valorConCosto += precio * stock
          conCosto++
        }
        if (stock === 0) cero++
        else if (stock <= minimo) bajo++
      }
      const gananciaEsperada = valorConCosto - costoMxn
      inventarioResumen = {
        total: invRows.length,
        valor_mxn: valorMxn,
        valor_usd: valorMxn / (fxRateHoy ? Number(fxRateHoy.rate_compra) : 17),
        bajo_stock: bajo,
        agotados: cero,
        costo_mxn: costoMxn > 0 ? costoMxn : undefined,
        ganancia_esperada_mxn: conCosto > 0 ? gananciaEsperada : undefined,
        productos_con_costo: conCosto,
      }
    }
  } catch {
    // tabla aún no existe
  }

  // === Próximos pagos a Patricia (enfermera) — sábados y quincenas ===
  type PagoPatricia = { etiqueta: string; fecha: string; monto: number; emoji: string; nota?: string }
  const proxPagosPatricia: PagoPatricia[] = []
  const { data: cfgPatricia } = await admin
    .from('clinica_config_enfermera')
    .select('enfermera_id, sueldo_base_quincenal')
    .eq('activa', true)
    .maybeSingle()
  if (cfgPatricia?.enfermera_id) {
    // En curso: comisiones + propinas aprobadas sin cortar
    const { data: enCursoRows } = await admin
      .from('clinica_realizados')
      .select('tipo, pago_comision, propina, pago_id, propina_pago_id')
      .eq('enfermera_id', cfgPatricia.enfermera_id)
      .eq('estado_aprobacion', 'aprobado')
      .or('pago_id.is.null,propina_pago_id.is.null')
    const rows = enCursoRows ?? []
    const comAcum = rows.filter((r) => r.tipo !== 'review' && r.pago_id == null).reduce((s, r) => s + Number(r.pago_comision), 0)
    const propAcum = rows.filter((r) => r.propina_pago_id == null && Number(r.propina) > 0).reduce((s, r) => s + Number(r.propina), 0)

    // Próximo sábado
    const hoyDate = new Date(hoy + 'T12:00:00')
    const dow = hoyDate.getDay() // 0=dom..6=sab
    const diasParaSat = (6 - dow + 7) % 7 || 7
    const proxSat = new Date(hoyDate)
    proxSat.setDate(hoyDate.getDate() + diasParaSat)
    const fechaSat = proxSat.toISOString().slice(0, 10)
    proxPagosPatricia.push({
      etiqueta: 'Comisiones + propinas (sábado)',
      fecha: fechaSat,
      monto: comAcum + propAcum,
      emoji: '🩺',
      nota: `acumulado actual: ${comAcum > 0 ? `$${comAcum.toFixed(0)} comisiones` : ''}${comAcum > 0 && propAcum > 0 ? ' + ' : ''}${propAcum > 0 ? `$${propAcum.toFixed(0)} propinas` : !comAcum && !propAcum ? 'aún sin movimiento' : ''}`,
    })

    // Próxima quincena (día 15 o último del mes)
    const diaHoy = Number(hoy.slice(8, 10))
    const ym = hoy.slice(0, 7)
    let fechaQ: string
    if (diaHoy < 15) {
      fechaQ = `${ym}-15`
    } else {
      // siguiente quincena: día 30 (o último) si todavía no, sino día 15 del siguiente mes
      const finMes = new Date(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0).getDate()
      const dia30 = Math.min(30, finMes)
      if (diaHoy < dia30) {
        fechaQ = `${ym}-${String(dia30).padStart(2, '0')}`
      } else {
        const y = Number(hoy.slice(0, 4))
        const m = Number(hoy.slice(5, 7))
        const ny = m === 12 ? y + 1 : y
        const nm = m === 12 ? 1 : m + 1
        fechaQ = `${ny}-${String(nm).padStart(2, '0')}-15`
      }
    }
    proxPagosPatricia.push({
      etiqueta: 'Quincena (sueldo base)',
      fecha: fechaQ,
      monto: Number(cfgPatricia.sueldo_base_quincenal ?? 0),
      emoji: '💼',
    })
    // ordena por fecha asc
    proxPagosPatricia.sort((a, b) => a.fecha.localeCompare(b.fecha))
  }

  // Saldos por cuenta (saldo_inicial + tx desde la fecha de saldo inicial).
  // Se acota por fecha para no chocar con el corte de 1000 filas de Supabase.
  const { data: cuentasSaldo } = await admin.from('cuentas')
    .select('id, nombre, titular, tipo, moneda, saldo_inicial_mxn, saldo_inicial_usd, saldo_inicial_fecha, saldo_inicial_locked, saldo_inicial_notas')
    .eq('activo', true)
  const desdeSaldo = fechaSaldoMasAntigua((cuentasSaldo ?? []) as unknown as CuentaConSaldoInicial[])
  const { data: txTodas } = await admin.from('transacciones')
    .select('tipo, monto, moneda, cuenta_id, fecha')
    .gte('fecha', desdeSaldo)
    .limit(20000)
  const fxFallbackTemp = fxRateHoy ? Number(fxRateHoy.rate_compra) : (fxHistorial?.[0] ? Number(fxHistorial[0].rate_compra) : null)
  const saldos = calcularSaldos(
    (cuentasSaldo ?? []) as unknown as CuentaConSaldoInicial[],
    (txTodas ?? []) as unknown as TxParaSaldo[],
    fxFallbackTemp
  )
  const cuentasSinCapturar = saldos.por_cuenta.filter((c) => !c.locked).length

  // Proyección de cash flow 90d (incluye saldo actual + eventos agendados)
  const cashflowForecast = await proyectarCashFlow({ admin, dias: 90 }).catch(() => null)

  // Último resumen semanal IA (si existe, generado por cron lunes 8am)
  const { data: ultimoResumen } = await admin
    .from('resumen_semanal')
    .select('id, semana_inicio, semana_fin, generado_at, resumen_md, datos')
    .order('semana_inicio', { ascending: false })
    .limit(1)
    .maybeSingle()

  // FX rate fallback: prefiere el de hoy, sino el más reciente conocido
  let fxFallback: number | null = fxRateHoy ? Number(fxRateHoy.rate_compra) : null
  if (!fxFallback && fxHistorial && fxHistorial.length > 0) {
    fxFallback = Number(fxHistorial[0].rate_compra)
  }

  // Totales del periodo anterior (con conversión USD)
  const tPrev = totalizar(txPrevio ?? [], fxFallback)

  function pctChange(actual: number, prev: number): number | null {
    if (prev === 0) return null
    return ((actual - prev) / Math.abs(prev)) * 100
  }

  const rows = transacciones ?? []
  const t = totalizar(rows, fxFallback)
  const seriePorDia = porDia(rows, fxFallback)
  const barNegocios = porNegocio(rows, negocios ?? [], fxFallback)
  const desgloseCats = desglosarCategorias(rows, fxFallback)
  const margen = t.ingresos_total_mxn > 0 ? (t.utilidad_total_mxn / t.ingresos_total_mxn) * 100 : null

  // Radiografía del periodo: negocio campeón/a vigilar, top gastos, ingresos por método
  const equivMxnRow = (x: { monto: number | string; moneda: string; monto_mxn_equivalente?: number | string | null }) =>
    x.monto_mxn_equivalente != null ? Number(x.monto_mxn_equivalente) : (x.moneda === 'MXN' ? Number(x.monto) : (fxFallback ? Number(x.monto) * fxFallback : 0))

  const negociosUtilidad = barNegocios
    .map((n) => ({ nombre: n.nombre, utilidad: n.ingresos - n.gastos }))
    .sort((a, b) => b.utilidad - a.utilidad)
  const mejorNeg = negociosUtilidad[0] ?? null
  const peorNeg = negociosUtilidad.length > 1 ? negociosUtilidad[negociosUtilidad.length - 1] : null

  const topGastos = rows
    .filter((x) => x.tipo === 'gasto')
    .map((x) => ({ concepto: x.concepto as string | null, mxn: equivMxnRow(x), moneda: x.moneda as 'MXN' | 'USD', monto: Number(x.monto) }))
    .sort((a, b) => b.mxn - a.mxn)
    .slice(0, 3)

  const METODO_LABEL: Record<string, string> = {
    stripe: '💳 Stripe', mp_terminal: '📟 MP Terminal', mp_transferencia: '🔵 MP Transf.', mp_link: '🔗 MP Link',
    efectivo_mxn: '💵 Efectivo', efectivo_usd: '💵 Efectivo USD', transferencia_bancaria: '🏦 Transferencia',
    tarjeta: '💳 Tarjeta', domiciliado: '🔁 Domiciliado', otro: '· Otro',
  }
  const porMetodoMap = new Map<string, number>()
  for (const x of rows) {
    if (x.tipo !== 'ingreso') continue
    const m = (x.metodo_pago as string | null) ?? 'otro'
    porMetodoMap.set(m, (porMetodoMap.get(m) ?? 0) + equivMxnRow(x))
  }
  const ingresosPorMetodo = Array.from(porMetodoMap.entries())
    .map(([metodo, mxn]) => ({ metodo, label: METODO_LABEL[metodo] ?? metodo, mxn }))
    .sort((a, b) => b.mxn - a.mxn)
  const totalIngMetodo = ingresosPorMetodo.reduce((s, m) => s + m.mxn, 0)

  // Resumen Por Pagar
  const pp = { totalMxn: 0, totalUsd: 0, vencidoMxn: 0, vencidoUsd: 0, count: 0, vencidoCount: 0 }
  for (const c of porPagarRows ?? []) {
    const restante = Number(c.monto_total) - Number(c.monto_pagado)
    if (restante <= 0) continue
    const vencido = !!c.fecha_vencimiento && c.fecha_vencimiento < hoy
    pp.count++
    if (c.moneda === 'USD') {
      pp.totalUsd += restante
      if (vencido) { pp.vencidoUsd += restante; pp.vencidoCount++ }
    } else {
      pp.totalMxn += restante
      if (vencido) { pp.vencidoMxn += restante; pp.vencidoCount++ }
    }
  }

  // Resumen Por Cobrar (cuentas + eventos pendientes Rancho)
  const pc = { totalMxn: 0, totalUsd: 0, vencidoMxn: 0, vencidoUsd: 0, count: 0, vencidoCount: 0 }
  for (const c of porCobrarRows ?? []) {
    const restante = Number(c.monto_total) - Number(c.monto_cobrado)
    if (restante <= 0) continue
    const vencido = !!c.fecha_vencimiento && c.fecha_vencimiento < hoy
    pc.count++
    if (c.moneda === 'USD') {
      pc.totalUsd += restante
      if (vencido) { pc.vencidoUsd += restante; pc.vencidoCount++ }
    } else {
      pc.totalMxn += restante
      if (vencido) { pc.vencidoMxn += restante; pc.vencidoCount++ }
    }
  }
  // Sumar eventos pendientes (Rancho) al total de por cobrar
  for (const e of eventosPendRows ?? []) {
    const pagos = (e.eventos_pagos as Array<{ monto: number }>) ?? []
    const cobrado = pagos.reduce((sum, p) => sum + Number(p.monto), 0)
    const pendiente = Number(e.monto_total) - cobrado
    if (pendiente <= 0.01) continue
    const vencido = !!e.fecha_evento && e.fecha_evento < hoy
    pc.count++
    if (e.moneda === 'USD') {
      pc.totalUsd += pendiente
      if (vencido) { pc.vencidoUsd += pendiente; pc.vencidoCount++ }
    } else {
      pc.totalMxn += pendiente
      if (vencido) { pc.vencidoMxn += pendiente; pc.vencidoCount++ }
    }
  }

  const totalAlertas = (nTareas ?? 0) + (nMultas ?? 0) + (nPendientes ?? 0) + pp.vencidoCount + pc.vencidoCount

  return (
    <div className="px-4 pt-5 pb-28 space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient">Dashboard</h1>
          <span className="chip chip-cyan">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            LIVE
          </span>
        </div>
        <RangoSelector actual={rangoId} customDesde={sp.desde} customHasta={sp.hasta} />
      </div>

      {/* ============================================================
         💵 Alerta: sin rate del día
         ============================================================ */}
      {!fxRateHoy && (
        <Link href="/fx" className="card-glow border-amber-500/50 bg-amber-500/5 p-4 flex items-center gap-3 hover:bg-amber-500/10 transition-colors">
          <DollarSign className="h-5 w-5 text-amber-300" />
          <div className="flex-1 leading-tight">
            <p className="text-sm font-bold text-amber-300">Falta el tipo de cambio de hoy</p>
            <p className="text-[11px] text-amber-200/70">Captura o trae de Google · USD/MXN se usa en todos los totales</p>
          </div>
          <ChevronRight className="h-4 w-4 text-amber-300" />
        </Link>
      )}

      {/* ============================================================
         🚨 ALERTAS — siempre arriba, default abierta
         ============================================================ */}
      {totalAlertas > 0 && (
        <CollapsibleSection
          id="alertas"
          title="Requiere atención"
          emoji="🚨"
          badge={totalAlertas}
          badgeColor="bg-rose-500/20 text-rose-300"
          defaultOpen
        >
          <div className="grid grid-cols-1 gap-2">
            {pp.vencidoCount > 0 && (
              <Link href="/por-pagar" className="card border-rose-500/40 bg-rose-500/5 p-3 flex items-center gap-3 hover:bg-rose-500/10 transition-colors">
                <span className="text-2xl">💸</span>
                <div className="flex-1 leading-tight">
                  <p className="text-sm font-bold text-rose-300">{pp.vencidoCount} cuenta{pp.vencidoCount > 1 ? 's' : ''} por pagar vencida{pp.vencidoCount > 1 ? 's' : ''}</p>
                  <p className="text-[11px] text-rose-300/70 tabular-nums">
                    {formatMoney(pp.vencidoMxn, 'MXN')}{pp.vencidoUsd > 0 ? ` + ${formatMoney(pp.vencidoUsd, 'USD')}` : ''}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-rose-300" />
              </Link>
            )}
            {pc.vencidoCount > 0 && (
              <Link href="/por-cobrar" className="card border-amber-500/40 bg-amber-500/5 p-3 flex items-center gap-3 hover:bg-amber-500/10 transition-colors">
                <span className="text-2xl">💰</span>
                <div className="flex-1 leading-tight">
                  <p className="text-sm font-bold text-amber-300">{pc.vencidoCount} cobro{pc.vencidoCount > 1 ? 's' : ''} vencido{pc.vencidoCount > 1 ? 's' : ''}</p>
                  <p className="text-[11px] text-amber-300/70 tabular-nums">
                    {formatMoney(pc.vencidoMxn, 'MXN')}{pc.vencidoUsd > 0 ? ` + ${formatMoney(pc.vencidoUsd, 'USD')}` : ''}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-amber-300" />
              </Link>
            )}
            {(nMultas ?? 0) > 0 && (
              <Link href="/multas" className="card border-rose-500/40 bg-rose-500/5 p-3 flex items-center gap-3 hover:bg-rose-500/10 transition-colors">
                <span className="text-2xl">⚠️</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-rose-300">{nMultas} multa{(nMultas ?? 0) > 1 ? 's' : ''} por resolver</p>
                </div>
                <ChevronRight className="h-4 w-4 text-rose-300" />
              </Link>
            )}
            {(nTareas ?? 0) > 0 && (
              <Link href="/tareas" className="card border-amber-500/40 bg-amber-500/5 p-3 flex items-center gap-3 hover:bg-amber-500/10 transition-colors">
                <span className="text-2xl">⌛</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-300">{nTareas} tarea{(nTareas ?? 0) > 1 ? 's' : ''} activa{(nTareas ?? 0) > 1 ? 's' : ''}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-amber-300" />
              </Link>
            )}
            {(nPendientes ?? 0) > 0 && (
              <Link href="/auditor" className="card border-cyan-500/40 bg-cyan-500/5 p-3 flex items-center gap-3 hover:bg-cyan-500/10 transition-colors">
                <span className="text-2xl">🤖</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-cyan-300">{nPendientes} pregunta{(nPendientes ?? 0) > 1 ? 's' : ''} del auditor</p>
                </div>
                <ChevronRight className="h-4 w-4 text-cyan-300" />
              </Link>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* ============================================================
         💰 RESUMEN — utilidad + KPIs + por pagar/cobrar
         ============================================================ */}
      <CollapsibleSection id="resumen" title="Resumen" emoji="💰" defaultOpen>
        {/* Hero: Utilidad TOTAL (MXN + USD convertidos al rate del día) */}
        <section className="card-glow p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="label-caps">Utilidad · {r.label}</span>
            <DeltaBadge actual={t.utilidad_total_mxn} prev={tPrev.utilidad_total_mxn} />
          </div>
          <div className="space-y-1">
            <p className={`text-4xl font-black tabular-nums ${t.utilidad_total_mxn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {t.utilidad_total_mxn >= 0 ? '+' : ''}{formatMoney(t.utilidad_total_mxn, 'MXN')}
            </p>
            {margen !== null && (
              <p className="text-[11px] text-zinc-400">
                Margen: <span className={cn('font-bold tabular-nums', margen >= 0 ? 'text-emerald-300' : 'text-rose-300')}>{margen.toFixed(1)}%</span>
                <span className="text-zinc-600"> · de cada $100 que entran, {margen >= 0 ? `$${margen.toFixed(0)} son ganancia` : `pierdes $${Math.abs(margen).toFixed(0)}`}</span>
              </p>
            )}
            {tPrev.utilidad_total_mxn !== 0 && (
              <p className="text-[11px] text-zinc-500">
                Periodo anterior: {formatMoney(tPrev.utilidad_total_mxn, 'MXN')}
              </p>
            )}
            {(t.ingresos_usd > 0 || t.gastos_usd > 0) && (
              <p className="text-[11px] text-zinc-500">
                Incluye {t.ingresos_usd > 0 && `${formatMoney(t.ingresos_usd, 'USD')} ingresos`}
                {t.gastos_usd > 0 && t.ingresos_usd > 0 && ' y '}
                {t.gastos_usd > 0 && `${formatMoney(t.gastos_usd, 'USD')} gastos`} convertidos al rate del día
              </p>
            )}
          </div>
        </section>

        {/* KPIs Ingresos / Gastos (totales en MXN, incluyen USD convertidos) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <ArrowUpRight className="h-4 w-4" />
              <span className="label-caps text-emerald-400">Ingresos</span>
              <span className="ml-auto"><DeltaBadge actual={t.ingresos_total_mxn} prev={tPrev.ingresos_total_mxn} compact /></span>
            </div>
            <p className="text-2xl font-black tabular-nums text-emerald-300">
              {formatMoney(t.ingresos_total_mxn, 'MXN')}
            </p>
            {t.ingresos_usd > 0 && (
              <p className="text-[10px] text-zinc-500 tabular-nums">incl. {formatMoney(t.ingresos_usd, 'USD')}</p>
            )}
          </div>
          <div className="card p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-rose-400">
              <ArrowDownRight className="h-4 w-4" />
              <span className="label-caps text-rose-400">Gastos</span>
              <span className="ml-auto"><DeltaBadge actual={t.gastos_total_mxn} prev={tPrev.gastos_total_mxn} compact invertColor /></span>
            </div>
            <p className="text-2xl font-black tabular-nums text-rose-300">
              {formatMoney(t.gastos_total_mxn, 'MXN')}
            </p>
            {t.gastos_usd > 0 && (
              <p className="text-[10px] text-zinc-500 tabular-nums">incl. {formatMoney(t.gastos_usd, 'USD')}</p>
            )}
          </div>
        </div>

        {/* Saldo total del sistema (de saldos iniciales + tx) */}
        <Link
          href="/cashflow"
          className={cn(
            'card p-4 flex items-center gap-3 hover:bg-[var(--bg-card-hover)] transition-colors',
            cuentasSinCapturar > 0 ? 'border-amber-500/40 bg-amber-500/5' : ''
          )}
        >
          <div className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-cyan-500/15 border border-cyan-500/30">
            💵
          </div>
          <div className="flex-1 leading-tight">
            <p className="label-caps">Saldo total del sistema</p>
            <p className="text-xl font-black tabular-nums text-cyan-300">{formatMoney(saldos.total_mxn, 'MXN')}</p>
            {cuentasSinCapturar > 0 ? (
              <p className="text-[10px] text-amber-300">⚠ {cuentasSinCapturar} cuenta{cuentasSinCapturar > 1 ? 's' : ''} sin saldo inicial</p>
            ) : (
              <p className="text-[10px] text-zinc-500">{saldos.por_cuenta.filter((c) => c.locked).length} cuentas activas</p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-400" />
        </Link>

        {/* Cobros MP sin categorizar — al inicio para que destaque */}
        <CobrosPendientesCard pendientes={cobrosPendientes} />

        {/* Resumen del inventario de farmacia */}
        {inventarioResumen && <InventarioCard resumen={inventarioResumen} />}

        {/* FX widget */}
        <FxMiniWidget rateHoy={fxRateHoy} historial={fxHistorial ?? []} />

        {/* Resumen semanal IA (último disponible) */}
        {ultimoResumen && <ResumenSemanalCard row={ultimoResumen as ResumenSemanalRow} />}

        {/* Proyección cash flow 30/60/90d */}
        {cashflowForecast && <CashflowForecastCard f={cashflowForecast} />}

        {/* Próximos pagos a Patricia (clínica) */}
        {proxPagosPatricia.length > 0 && (
          <Link href="/clinica?tab=pagos" className="card p-3 space-y-2 hover:bg-[var(--bg-card-hover)] transition-colors">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">🏥</span>
              <p className="label-caps text-emerald-300">Próximos pagos · Patricia</p>
              <ChevronRight className="h-4 w-4 text-zinc-400 ml-auto" />
            </div>
            <ul className="space-y-1.5">
              {proxPagosPatricia.map((p, i) => {
                const dias = Math.ceil((new Date(p.fecha + 'T00:00:00').getTime() - new Date(hoy + 'T00:00:00').getTime()) / (24 * 60 * 60 * 1000))
                const cuando = dias === 0 ? 'HOY' : dias === 1 ? 'mañana' : `en ${dias} días`
                return (
                  <li key={i} className="flex items-center gap-2 text-xs">
                    <span>{p.emoji}</span>
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="font-medium text-zinc-200 truncate">{p.etiqueta}</p>
                      <p className="text-[10px] text-zinc-500">{formatearFecha(p.fecha, 'EEE dd MMM')} · {cuando}{p.nota ? ` · ${p.nota}` : ''}</p>
                    </div>
                    <p className={cn('text-sm font-bold tabular-nums', p.monto > 0 ? 'text-emerald-300' : 'text-zinc-500')}>{formatMoney(p.monto, 'MXN')}</p>
                  </li>
                )
              })}
            </ul>
          </Link>
        )}

        {/* Por Pagar + Por Cobrar */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/por-pagar" className="card p-4 space-y-2 hover:bg-[var(--bg-card-hover)] transition-colors">
            <div className="flex items-center gap-1.5 text-rose-400">
              <TrendingDown className="h-4 w-4" />
              <span className="label-caps text-rose-400">Por pagar</span>
            </div>
            <p className="text-xl font-black tabular-nums text-rose-300">
              {formatMoney(pp.totalMxn, 'MXN')}
            </p>
            {pp.totalUsd > 0 && (
              <p className="text-xs text-zinc-500 tabular-nums">+ {formatMoney(pp.totalUsd, 'USD')}</p>
            )}
            <p className="text-[10px] text-zinc-500">
              {pp.count} cuenta{pp.count !== 1 ? 's' : ''}{pp.vencidoCount > 0 ? ` · ${pp.vencidoCount} vencida${pp.vencidoCount > 1 ? 's' : ''}` : ''}
            </p>
          </Link>

          <Link href="/por-cobrar" className="card p-4 space-y-2 hover:bg-[var(--bg-card-hover)] transition-colors">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <TrendingUp className="h-4 w-4" />
              <span className="label-caps text-emerald-400">Por cobrar</span>
            </div>
            <p className="text-xl font-black tabular-nums text-emerald-300">
              {formatMoney(pc.totalMxn, 'MXN')}
            </p>
            {pc.totalUsd > 0 && (
              <p className="text-xs text-zinc-500 tabular-nums">+ {formatMoney(pc.totalUsd, 'USD')}</p>
            )}
            <p className="text-[10px] text-zinc-500">
              {pc.count} cuenta{pc.count !== 1 ? 's' : ''}{pc.vencidoCount > 0 ? ` · ${pc.vencidoCount} vencida${pc.vencidoCount > 1 ? 's' : ''}` : ''}
            </p>
          </Link>
        </div>

        {/* CTA Captura IA */}
        <Link
          href="/chat"
          className="block card-glow p-4 border-cyan-500/40 bg-gradient-to-br from-cyan-500/5 to-blue-500/5"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/30">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-cyan-300">Captura con IA</p>
              <p className="text-xs text-cyan-300/60">Foto, voz o texto en lenguaje natural</p>
            </div>
            <ChevronRight className="h-5 w-5 text-cyan-400" />
          </div>
        </Link>
      </CollapsibleSection>

      {/* ============================================================
         📅 PRÓXIMOS — eventos + gastos fijos + por-pagar + últimas tx
         ============================================================ */}
      <CollapsibleSection id="proximos" title="Próximos 7 días & recientes" emoji="📅" defaultOpen>
        {eventosProx && eventosProx.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="label-caps">🎉 Próximos eventos</p>
              <Link href="/eventos" className="text-xs text-cyan-400 font-semibold">Ver todos →</Link>
            </div>
            <ul className="space-y-1.5">
              {eventosProx.map((e) => (
                <li key={e.id}>
                  <Link href={`/eventos/${e.id}`} className="card flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{e.cliente_nombre}</p>
                      <p className="text-xs text-zinc-500">{formatearFecha(e.fecha_evento, 'EEEE dd MMM')}</p>
                    </div>
                    <p className="text-sm font-bold text-emerald-400 tabular-nums">
                      {formatMoney(Number(e.monto_total), e.moneda as 'MXN' | 'USD')}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {gastosFijosProx && gastosFijosProx.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="label-caps">📅 Gastos fijos próximos</p>
              <Link href="/recurrentes" className="text-xs text-cyan-400 font-semibold">Ver todos →</Link>
            </div>
            <ul className="space-y-1.5">
              {gastosFijosProx.map((g) => {
                const neg = g.negocios as unknown as { nombre: string } | null
                const diasFalta = Math.ceil(
                  (new Date(g.proximo_pago + 'T00:00:00').getTime() - new Date(hoy + 'T00:00:00').getTime())
                  / (24 * 60 * 60 * 1000)
                )
                return (
                  <li key={g.id}>
                    <Link href={`/recurrentes/${g.id}`} className="card flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                      <div className="flex-1 min-w-0 leading-tight">
                        <p className="text-sm font-bold text-white truncate">{g.nombre}</p>
                        <p className="text-[10px] text-zinc-500">
                          {neg?.nombre ?? '—'} · {diasFalta === 0 ? 'HOY' : diasFalta === 1 ? 'mañana' : `en ${diasFalta} días`}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-blue-400 tabular-nums">
                        {formatMoney(Number(g.monto), g.moneda as 'MXN' | 'USD')}
                      </p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {porPagarProx && porPagarProx.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="label-caps">💸 Por pagar próximas</p>
              <Link href="/por-pagar" className="text-xs text-cyan-400 font-semibold">Ver todas →</Link>
            </div>
            <ul className="space-y-1.5">
              {porPagarProx.map((c) => {
                const neg = c.negocios as unknown as { nombre: string } | null
                const restante = Number(c.monto_total) - Number(c.monto_pagado)
                const diasFalta = c.fecha_vencimiento
                  ? Math.ceil(
                      (new Date(c.fecha_vencimiento + 'T00:00:00').getTime() - new Date(hoy + 'T00:00:00').getTime())
                      / (24 * 60 * 60 * 1000)
                    )
                  : null
                return (
                  <li key={c.id}>
                    <Link href={`/por-pagar/${c.id}`} className="card flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                      <div className="flex-1 min-w-0 leading-tight">
                        <p className="text-sm font-bold text-white truncate">{c.proveedor}</p>
                        <p className="text-[10px] text-zinc-500 truncate">
                          {c.concepto}
                          {neg?.nombre && ` · ${neg.nombre}`}
                          {diasFalta !== null && ` · ${diasFalta === 0 ? 'HOY' : diasFalta === 1 ? 'mañana' : `en ${diasFalta}d`}`}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-rose-400 tabular-nums">
                        {formatMoney(restante, c.moneda as 'MXN' | 'USD')}
                      </p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Últimas transacciones */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="label-caps">Últimas transacciones</p>
            <Link href="/transacciones" className="text-xs text-cyan-400 font-semibold">Ver todas →</Link>
          </div>
          {ultimas && ultimas.length > 0 ? (
            <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
              {ultimas.map((u) => {
                const negs = u.negocios as unknown as { nombre: string } | null
                const isGasto = u.tipo === 'gasto' || u.tipo === 'multa_interna'
                const mxnEq = (u as { monto_mxn_equivalente?: number | null }).monto_mxn_equivalente
                const mxnEqRuntime = u.moneda === 'USD' && mxnEq == null && fxFallback
                  ? Number(u.monto) * fxFallback
                  : null
                const showMxnConversion = u.moneda === 'USD' && (mxnEq != null || mxnEqRuntime != null)
                return (
                  <li key={u.id}>
                    <Link href={`/transacciones/${u.id}`} className="flex items-center gap-3 p-3 hover:bg-white/5 transition-colors">
                      <div className="flex-1 min-w-0 leading-tight">
                        <p className="text-sm font-semibold truncate text-zinc-100">{u.concepto || 'Sin concepto'}</p>
                        <p className="text-xs text-zinc-500 truncate">
                          {negs?.nombre ?? '—'} · {formatearFecha(u.fecha, 'dd MMM')}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold tabular-nums ${isGasto ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {isGasto ? '−' : '+'}{formatMoney(Number(u.monto), u.moneda as 'MXN' | 'USD')}
                        </p>
                        {showMxnConversion && (
                          <p className="text-[10px] text-zinc-500 tabular-nums">
                            ≈ {formatMoney(Number(mxnEq ?? mxnEqRuntime ?? 0), 'MXN')}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="card border-dashed p-6 text-center text-sm text-zinc-500">
              Sin transacciones aún. Usa Captura IA o el botón manual.
            </div>
          )}
        </div>

        <Link
          href="/transacciones/nueva"
          className="block btn-ghost flex items-center justify-center gap-2 text-cyan-300"
        >
          <Plus className="h-4 w-4" />
          Captura manual
        </Link>
      </CollapsibleSection>

      {/* ============================================================
         📊 ANALYTICS — gráficas, plegadas por default
         ============================================================ */}
      <CollapsibleSection id="analytics" title="Analytics" emoji="📊" defaultOpen>
        <UtilidadChart data={seriePorDia} />
        <NegociosBar data={barNegocios} />
        {desgloseCats.items.length > 0 && (
          <AnalisisCategorias items={desgloseCats.items} total={desgloseCats.total} />
        )}

        {/* Negocio campeón / a vigilar */}
        {mejorNeg && (mejorNeg.utilidad !== 0 || peorNeg) && (
          <div className="grid grid-cols-2 gap-2">
            <div className="card p-3 border-emerald-500/20">
              <p className="text-[9px] uppercase tracking-wider text-zinc-500">🏆 Más rentable</p>
              <p className="text-xs font-bold text-white truncate">{mejorNeg.nombre}</p>
              <p className={cn('text-sm font-black tabular-nums', mejorNeg.utilidad >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                {mejorNeg.utilidad >= 0 ? '+' : ''}{formatMoney(mejorNeg.utilidad, 'MXN')}
              </p>
            </div>
            {peorNeg && (
              <div className="card p-3 border-rose-500/20">
                <p className="text-[9px] uppercase tracking-wider text-zinc-500">⚠️ A vigilar</p>
                <p className="text-xs font-bold text-white truncate">{peorNeg.nombre}</p>
                <p className={cn('text-sm font-black tabular-nums', peorNeg.utilidad >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                  {peorNeg.utilidad >= 0 ? '+' : ''}{formatMoney(peorNeg.utilidad, 'MXN')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Top 3 gastos más grandes */}
        {topGastos.length > 0 && (
          <div className="card p-3 space-y-2">
            <p className="label-caps">💸 Gastos más grandes</p>
            <ul className="space-y-1.5">
              {topGastos.map((g, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-600 font-bold w-4">{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate text-zinc-200">{g.concepto || 'Sin concepto'}</span>
                  <span className="font-bold tabular-nums text-rose-300">{formatMoney(g.monto, g.moneda)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Ingresos por método de pago */}
        {ingresosPorMetodo.length > 0 && totalIngMetodo > 0 && (
          <div className="card p-3 space-y-2">
            <p className="label-caps">Ingresos por método</p>
            <div className="space-y-1.5">
              {ingresosPorMetodo.map((m) => {
                const pct = (m.mxn / totalIngMetodo) * 100
                return (
                  <div key={m.metodo}>
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="text-zinc-300">{m.label}</span>
                      <span className="tabular-nums font-bold text-emerald-300">{formatMoney(m.mxn, 'MXN')} <span className="text-zinc-600 font-normal">{pct.toFixed(0)}%</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${Math.max(3, pct)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CollapsibleSection>
    </div>
  )
}

/**
 * Badge que muestra el % de cambio vs periodo anterior.
 * - invertColor: para gastos (subir es malo, bajar es bueno)
 * - compact: versión chiquita para cards
 */
function DeltaBadge({
  actual,
  prev,
  compact = false,
  invertColor = false,
}: {
  actual: number
  prev: number
  compact?: boolean
  invertColor?: boolean
}) {
  if (prev === 0) return null
  const change = ((actual - prev) / Math.abs(prev)) * 100
  if (Math.abs(change) < 0.5) {
    return (
      <span className={cn(
        'inline-flex items-center gap-0.5 rounded-full bg-zinc-500/10 text-zinc-400 font-bold tabular-nums',
        compact ? 'h-4 px-1.5 text-[9px]' : 'h-5 px-2 text-[10px]'
      )}>
        = igual
      </span>
    )
  }
  const positivo = change > 0
  const esBueno = invertColor ? !positivo : positivo
  const color = esBueno ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
  const Icon = positivo ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 rounded-full font-bold tabular-nums',
      color,
      compact ? 'h-4 px-1.5 text-[9px]' : 'h-5 px-2 text-[10px]'
    )}>
      <Icon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {positivo ? '+' : ''}{Math.abs(change) >= 100 ? Math.round(change) : change.toFixed(1)}%
    </span>
  )
}
