import Link from 'next/link'
import { TrendingUp, TrendingDown, AlertCircle, Calendar, Users, CreditCard, Lock, Wallet, ChevronRight, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney, cn } from '@/lib/utils'
import { hoyEnCabos } from '@/lib/fechas'
import { totalMensualEquivalente } from '@/lib/recurrentes-total'
import { calcularSaldos, type CuentaConSaldoInicial, type TxParaSaldo } from '@/lib/saldos'
import { CuentaCard } from '@/components/cashflow/cuenta-card'
import { NuevaCuentaForm } from '@/components/cashflow/nueva-cuenta-form'

export default async function CashFlowPage() {
  const supabase = await createClient()
  const admin = createAdminClient()
  const hoy = hoyEnCabos()
  const inicioMes = hoy.slice(0, 7) + '-01'

  const [
    { data: cuentas },
    { data: txAll },
    { data: txMes },
    { data: gastosFijos },
    { data: porPagar },
    { data: empleados },
    { data: fxLatest },
    { data: porCobrar },
    { data: eventosPend },
  ] = await Promise.all([
    // Cuentas con campos de saldo inicial (defensivo si migración 0021 no aplicada)
    admin.from('cuentas')
      .select('id, nombre, titular, tipo, moneda, saldo_inicial_mxn, saldo_inicial_usd, saldo_inicial_fecha, saldo_inicial_locked, saldo_inicial_notas')
      .eq('activo', true)
      .order('nombre'),
    // TODAS las transacciones (para calcular saldo desde saldo_inicial; necesita fecha para filtrar)
    admin.from('transacciones').select('tipo, monto, moneda, cuenta_id, fecha'),
    // Tx solo del mes (para movimiento neto)
    supabase.from('transacciones').select('tipo, monto, moneda, fecha, cuenta_id').gte('fecha', inicioMes),
    admin.from('gastos_recurrentes').select('nombre, monto, moneda, frecuencia, proximo_pago').eq('activo', true),
    admin.from('cuentas_por_pagar').select('proveedor, monto_total, monto_pagado, moneda, fecha_vencimiento, estado').neq('estado', 'cancelado').neq('estado', 'pagado'),
    admin.from('empleados').select('nombre, empleado_compensacion(sueldo_base, moneda, frecuencia_pago)').eq('activo', true),
    admin.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
    // Por cobrar manuales
    admin.from('cuentas_por_cobrar').select('monto_total, monto_cobrado, moneda, fecha_vencimiento, estado').neq('estado', 'cancelado').neq('estado', 'cobrado'),
    // Eventos del Rancho pendientes
    admin.from('eventos').select('monto_total, moneda, fecha_evento, estado, eventos_pagos(monto)').in('estado', ['reservado', 'confirmado']),
  ])

  const fxRate = fxLatest ? Number(fxLatest.rate_compra) : null
  const cuentasArr = (cuentas ?? []) as unknown as CuentaConSaldoInicial[]
  const txArr = (txAll ?? []) as unknown as TxParaSaldo[]

  // Saldos calculados desde saldo_inicial + Σ movimientos históricos
  const saldos = calcularSaldos(cuentasArr, txArr, fxRate)

  // Movimientos del mes por cuenta (para mostrar tendencia)
  const movsMes = new Map<string, { mxn: number; usd: number }>()
  for (const t of txMes ?? []) {
    if (!t.cuenta_id) continue
    if (!movsMes.has(t.cuenta_id)) movsMes.set(t.cuenta_id, { mxn: 0, usd: 0 })
    const m = movsMes.get(t.cuenta_id)!
    const signo = t.tipo === 'ingreso' ? 1 : (t.tipo === 'gasto' || t.tipo === 'multa_interna') ? -1 : 0
    if (signo === 0) continue
    if (t.moneda === 'USD') m.usd += Number(t.monto) * signo
    else m.mxn += Number(t.monto) * signo
  }

  // Obligaciones del mes
  const totalGastosFijos = totalMensualEquivalente(gastosFijos ?? [])
  const totalPorPagarMXN = (porPagar ?? []).reduce((s, c) => c.moneda === 'MXN' ? s + (Number(c.monto_total) - Number(c.monto_pagado)) : s, 0)
  const totalPorPagarUSD = (porPagar ?? []).reduce((s, c) => c.moneda === 'USD' ? s + (Number(c.monto_total) - Number(c.monto_pagado)) : s, 0)
  const nominaTotal = (empleados ?? []).reduce((s, e) => {
    const comps = (e.empleado_compensacion as Array<{ sueldo_base: number; moneda: string; frecuencia_pago: string }> | null) ?? []
    for (const c of comps) {
      const factor = c.frecuencia_pago === 'mensual' ? 1 : c.frecuencia_pago === 'quincenal' ? 2 : c.frecuencia_pago === 'semanal' ? 4.33 : 0
      if (c.moneda === 'MXN') s += Number(c.sueldo_base) * factor
    }
    return s
  }, 0)

  const obligacionesMXN = totalGastosFijos.mxn + totalPorPagarMXN + nominaTotal
  const obligacionesUSD = totalGastosFijos.usd + totalPorPagarUSD
  const obligacionesTotalMxn = obligacionesMXN + obligacionesUSD * (fxRate ?? 17)

  const disponibleProyectado = saldos.total_mxn - obligacionesTotalMxn

  // POR COBRAR (solo clientes que deben a la empresa — Rancho NO va aquí porque es comisión, va separado)
  const porCobrarMxn = (porCobrar ?? []).reduce((s, c) => c.moneda === 'MXN' ? s + (Number(c.monto_total) - Number(c.monto_cobrado)) : s, 0)
  const porCobrarUsd = (porCobrar ?? []).reduce((s, c) => c.moneda === 'USD' ? s + (Number(c.monto_total) - Number(c.monto_cobrado)) : s, 0)
  const porCobrarTotalMxn = porCobrarMxn + porCobrarUsd * (fxRate ?? 17)

  // RANCHO MCCOY — separado: solo nos quedamos con la comisión (25% default), no el monto total
  let comisionRanchoMxn = 0, comisionRanchoUsd = 0
  for (const e of eventosPend ?? []) {
    const pagos = (e.eventos_pagos as Array<{ monto: number }>) ?? []
    const cobrado = pagos.reduce((sum, p) => sum + Number(p.monto), 0)
    const pend = Number(e.monto_total) - cobrado
    if (pend <= 0.01) continue
    // El sistema usa 25% por defecto si no se especifica
    const pct = 25 / 100
    const comision = pend * pct
    if (e.moneda === 'USD') comisionRanchoUsd += comision
    else comisionRanchoMxn += comision
  }
  const comisionRanchoTotalMxn = comisionRanchoMxn + comisionRanchoUsd * (fxRate ?? 17)

  // POR PAGAR equivalente total
  const porPagarTotalMxn = totalPorPagarMXN + totalPorPagarUSD * (fxRate ?? 17)

  // Neto si todo entra/sale: saldo + por cobrar empresa + comisión rancho - obligaciones
  const netoFinal = saldos.total_mxn + porCobrarTotalMxn + comisionRanchoTotalMxn - obligacionesTotalMxn

  // Runway: cuántos días dura el saldo al ritmo de gasto mensual
  const gastoMensualEstimado = obligacionesMXN + obligacionesUSD * (fxRate ?? 17)
  const runwayDias = gastoMensualEstimado > 0
    ? Math.floor((saldos.total_mxn / gastoMensualEstimado) * 30)
    : null

  const sinCapturar = saldos.por_cuenta.filter((c) => !c.locked)
  const capturadas = saldos.por_cuenta.filter((c) => c.locked)

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient">Cash Flow</h1>
          <span className="chip chip-cyan">Live</span>
        </div>
        <p className="text-sm text-zinc-400">Saldos reales por cuenta + proyección del mes.</p>
      </header>

      {/* Hero: Saldo total */}
      <section className="card-glow p-5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="label-caps inline-flex items-center gap-1.5">
            <Wallet className="h-3.5 w-3.5 text-cyan-400" />
            Saldo total del sistema
          </span>
          {fxRate && <span className="text-[10px] text-zinc-500">rate ${fxRate.toFixed(2)}</span>}
        </div>
        <p className="text-4xl font-black tabular-nums text-cyan-300">
          {formatMoney(saldos.total_mxn, 'MXN')}
        </p>
        <div className="flex items-baseline gap-3 text-xs">
          {saldos.total_solo_mxn !== 0 && (
            <span className="text-zinc-400 tabular-nums">{formatMoney(saldos.total_solo_mxn, 'MXN')}</span>
          )}
          {saldos.total_solo_usd !== 0 && (
            <span className="text-zinc-400 tabular-nums">+ {formatMoney(saldos.total_solo_usd, 'USD')}</span>
          )}
        </div>
        <p className="text-[10px] text-zinc-500">
          {capturadas.length} cuenta{capturadas.length !== 1 ? 's' : ''} capturada{capturadas.length !== 1 ? 's' : ''}
          {sinCapturar.length > 0 && ` · ${sinCapturar.length} pendiente${sinCapturar.length > 1 ? 's' : ''}`}
        </p>
      </section>

      {/* Por Cobrar ↔ Por Pagar mini cards */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/por-cobrar"
          className="card p-3 hover:bg-[var(--bg-card-hover)] transition-colors space-y-1 border-emerald-500/30"
        >
          <div className="flex items-center justify-between">
            <span className="label-caps text-emerald-400 inline-flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Por cobrar
            </span>
            <ChevronRight className="h-3 w-3 text-zinc-500" />
          </div>
          <p className="text-lg font-black tabular-nums text-emerald-300">
            {porCobrarUsd > 0 && porCobrarMxn === 0
              ? formatMoney(porCobrarUsd, 'USD')
              : formatMoney(porCobrarTotalMxn, 'MXN')}
          </p>
          {porCobrarUsd > 0 && (
            <p className="text-[10px] text-emerald-300/70 tabular-nums">
              {porCobrarMxn > 0 ? `incl. ${formatMoney(porCobrarUsd, 'USD')}` : `≈ ${formatMoney(porCobrarUsd * (fxRate ?? 17), 'MXN')}`}
            </p>
          )}
        </Link>

        <Link
          href="/por-pagar"
          className="card p-3 hover:bg-[var(--bg-card-hover)] transition-colors space-y-1 border-rose-500/30"
        >
          <div className="flex items-center justify-between">
            <span className="label-caps text-rose-400 inline-flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              Por pagar
            </span>
            <ChevronRight className="h-3 w-3 text-zinc-500" />
          </div>
          <p className="text-lg font-black tabular-nums text-rose-300">
            {totalPorPagarUSD > 0 && totalPorPagarMXN === 0
              ? formatMoney(totalPorPagarUSD, 'USD')
              : formatMoney(porPagarTotalMxn, 'MXN')}
          </p>
          {totalPorPagarUSD > 0 && (
            <p className="text-[10px] text-rose-300/70 tabular-nums">
              {totalPorPagarMXN > 0 ? `incl. ${formatMoney(totalPorPagarUSD, 'USD')}` : `≈ ${formatMoney(totalPorPagarUSD * (fxRate ?? 17), 'MXN')}`}
            </p>
          )}
        </Link>
      </div>

      {/* Comisión Rancho McCoy (NO es de la empresa, solo nos llevamos el 25%) */}
      {comisionRanchoTotalMxn > 0 && (
        <Link
          href="/eventos"
          className="card p-3 hover:bg-[var(--bg-card-hover)] transition-colors border-purple-500/30 flex items-center gap-3"
        >
          <span className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-purple-500/15 border border-purple-500/30 text-lg shrink-0">
            🎉
          </span>
          <div className="flex-1 leading-tight">
            <p className="label-caps text-purple-300">Comisión Rancho (25% pendiente)</p>
            <p className="text-base font-bold tabular-nums text-purple-200">
              {formatMoney(comisionRanchoTotalMxn, 'MXN')}
            </p>
            {comisionRanchoUsd > 0 && (
              <p className="text-[10px] text-purple-300/70 tabular-nums">incl. {formatMoney(comisionRanchoUsd, 'USD')}</p>
            )}
            <p className="text-[10px] text-zinc-500">Rancho McCoy no es parte de la empresa — solo cobramos comisión</p>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-500" />
        </Link>
      )}

      {/* Proyección — saldo - obligaciones */}
      <section className={cn(
        'card p-4 space-y-1',
        disponibleProyectado >= 0 ? 'border-emerald-500/40' : 'border-rose-500/40'
      )}>
        <div className="flex items-center gap-2">
          {disponibleProyectado >= 0 ? (
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 text-rose-400" />
          )}
          <span className="label-caps">Después de pagar TODO este mes</span>
        </div>
        <p className={cn(
          'text-2xl font-black tabular-nums',
          disponibleProyectado >= 0 ? 'text-emerald-300' : 'text-rose-300'
        )}>
          {disponibleProyectado >= 0 ? '+' : ''}{formatMoney(disponibleProyectado, 'MXN')}
        </p>
        <p className="text-[10px] text-zinc-500">
          Saldo total − obligaciones del mes ({formatMoney(obligacionesTotalMxn, 'MXN')})
        </p>
      </section>

      {/* Neto final: saldo + por cobrar - por pagar */}
      <section className={cn(
        'card-glow p-4 space-y-1',
        netoFinal >= 0 ? 'border-cyan-500/40' : 'border-amber-500/40'
      )}>
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-cyan-400" />
          <span className="label-caps">Neto final (si cobras todo + pagas todo)</span>
        </div>
        <p className={cn(
          'text-2xl font-black tabular-nums',
          netoFinal >= 0 ? 'text-cyan-300' : 'text-amber-300'
        )}>
          {netoFinal >= 0 ? '+' : ''}{formatMoney(netoFinal, 'MXN')}
        </p>
        <p className="text-[10px] text-zinc-500">
          {formatMoney(saldos.total_mxn, 'MXN')} saldo + {formatMoney(porCobrarTotalMxn, 'MXN')} cobros + {formatMoney(comisionRanchoTotalMxn, 'MXN')} comisión Rancho − {formatMoney(obligacionesTotalMxn, 'MXN')} obligaciones
        </p>
        {runwayDias !== null && runwayDias < 90 && (
          <p className={cn(
            'text-[10px] inline-flex items-center gap-1 mt-1',
            runwayDias < 30 ? 'text-rose-400' : runwayDias < 60 ? 'text-amber-400' : 'text-zinc-500'
          )}>
            <Clock className="h-2.5 w-2.5" />
            Runway: el saldo dura ~{runwayDias} días al ritmo actual ({formatMoney(gastoMensualEstimado, 'MXN')}/mes)
          </p>
        )}
      </section>

      {/* Pendientes de capturar saldo inicial */}
      {sinCapturar.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps inline-flex items-center gap-1.5 text-amber-300">
            <AlertCircle className="h-3 w-3" />
            Pendientes de capturar saldo inicial ({sinCapturar.length})
          </h2>
          <div className="space-y-2">
            {sinCapturar.map((c) => {
              const cuenta = cuentasArr.find((x) => x.id === c.cuenta_id)!
              return (
                <CuentaCard
                  key={c.cuenta_id}
                  cuenta={{
                    ...cuenta,
                    saldo_inicial_mxn: Number(cuenta.saldo_inicial_mxn ?? 0),
                    saldo_inicial_usd: Number(cuenta.saldo_inicial_usd ?? 0),
                    saldo_inicial_locked: !!cuenta.saldo_inicial_locked,
                  }}
                  movs={{ ingresos_mxn: c.ingresos_mxn, ingresos_usd: c.ingresos_usd, gastos_mxn: c.gastos_mxn, gastos_usd: c.gastos_usd }}
                  fxRate={fxRate}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* Cuentas activas */}
      {capturadas.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps inline-flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-emerald-400" />
            Cuentas con saldo capturado ({capturadas.length})
          </h2>
          <div className="space-y-2">
            {capturadas.map((c) => {
              const cuenta = cuentasArr.find((x) => x.id === c.cuenta_id)!
              return (
                <CuentaCard
                  key={c.cuenta_id}
                  cuenta={{
                    ...cuenta,
                    saldo_inicial_mxn: Number(cuenta.saldo_inicial_mxn ?? 0),
                    saldo_inicial_usd: Number(cuenta.saldo_inicial_usd ?? 0),
                    saldo_inicial_locked: !!cuenta.saldo_inicial_locked,
                  }}
                  movs={{ ingresos_mxn: c.ingresos_mxn, ingresos_usd: c.ingresos_usd, gastos_mxn: c.gastos_mxn, gastos_usd: c.gastos_usd }}
                  fxRate={fxRate}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* Agregar cuenta */}
      <NuevaCuentaForm />

      {/* Desglose obligaciones */}
      <section className="space-y-2">
        <h2 className="label-caps">Obligaciones del mes (lo que sale fijo)</h2>
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-400" />
              <span className="text-sm">Gastos fijos equiv. mensual</span>
            </div>
            <p className="text-sm font-bold tabular-nums text-blue-300">
              {formatMoney(totalGastosFijos.mxn, 'MXN')}
              {totalGastosFijos.usd > 0 && <span className="text-[10px] text-zinc-500 ml-1">+ {formatMoney(totalGastosFijos.usd, 'USD')}</span>}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-rose-400" />
              <span className="text-sm">Cuentas por pagar pendientes</span>
            </div>
            <p className="text-sm font-bold tabular-nums text-rose-300">
              {formatMoney(totalPorPagarMXN, 'MXN')}
              {totalPorPagarUSD > 0 && <span className="text-[10px] text-zinc-500 ml-1">+ {formatMoney(totalPorPagarUSD, 'USD')}</span>}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-400" />
              <span className="text-sm">Nómina mensual estimada</span>
            </div>
            <p className="text-sm font-bold tabular-nums text-indigo-300">
              {formatMoney(nominaTotal, 'MXN')}
            </p>
          </div>
          <div className="border-t border-[var(--border-subtle)] pt-2 flex items-center justify-between">
            <span className="text-sm font-bold">TOTAL OBLIGACIONES</span>
            <p className="text-base font-black tabular-nums text-rose-300">
              {formatMoney(obligacionesTotalMxn, 'MXN')}
            </p>
          </div>
        </div>
      </section>

      {/* Movimiento del mes por cuenta */}
      {movsMes.size > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps">Movimiento del mes por cuenta</h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {Array.from(movsMes.entries()).map(([cuentaId, m]) => {
              const cuenta = cuentasArr.find((c) => c.id === cuentaId)
              if (!cuenta) return null
              const monto = cuenta.moneda === 'USD' ? m.usd : m.mxn
              return (
                <li key={cuentaId} className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wallet className="h-4 w-4 text-cyan-400 shrink-0" />
                    <span className="text-sm text-white truncate">{cuenta.nombre}</span>
                  </div>
                  <p className={cn(
                    'text-sm font-bold tabular-nums shrink-0',
                    monto >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  )}>
                    {monto >= 0 ? '+' : ''}{formatMoney(monto, cuenta.moneda)}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Disclaimer */}
      <div className="card border-dashed p-4 space-y-1">
        <p className="text-xs text-zinc-400 leading-snug">
          ⓘ <strong>Cómo se calcula:</strong> cada saldo = inicial capturado + Σ ingresos − Σ gastos de esa cuenta. El saldo inicial se bloquea al capturarlo; para corregir se usa <strong>Ajustar saldo</strong> que crea una transacción con motivo.
        </p>
      </div>
    </div>
  )
}
