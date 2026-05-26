import {
  TrendingUp, TrendingDown, AlertCircle, Wallet, Calendar, Users, CreditCard,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, cn } from '@/lib/utils'
import { hoyEnCabos } from '@/lib/fechas'
import { totalizar } from '@/lib/agregaciones'
import { totalMensualEquivalente } from '@/lib/recurrentes-total'

export default async function CashFlowPage() {
  const supabase = await createClient()
  const hoy = hoyEnCabos()
  const inicioMes = hoy.slice(0, 7) + '-01'

  // Cargar todo en paralelo
  const [
    { data: txMes },
    { data: cuentas },
    { data: gastosFijos },
    { data: porPagar },
    { data: empleados },
  ] = await Promise.all([
    supabase.from('transacciones').select('tipo, monto, moneda, fecha, categoria, negocio_id, cuenta_id').gte('fecha', inicioMes),
    supabase.from('cuentas').select('id, nombre, moneda, tipo').eq('activo', true).order('nombre'),
    supabase.from('gastos_recurrentes').select('nombre, monto, moneda, frecuencia, proximo_pago').eq('activo', true),
    supabase.from('cuentas_por_pagar').select('proveedor, monto_total, monto_pagado, moneda, fecha_vencimiento, estado').neq('estado', 'cancelado').neq('estado', 'pagado'),
    supabase.from('empleados').select('nombre, empleado_compensacion(sueldo_base, moneda, frecuencia_pago)').eq('activo', true),
  ])

  const t = totalizar(txMes ?? [])

  // Saldo por cuenta (solo del mes actual, simulado)
  const saldoCuentas = new Map<string, { nombre: string; mxn: number; usd: number; moneda: string }>()
  for (const c of cuentas ?? []) {
    saldoCuentas.set(c.id, { nombre: c.nombre, mxn: 0, usd: 0, moneda: c.moneda })
  }
  for (const tx of txMes ?? []) {
    if (!tx.cuenta_id) continue
    const s = saldoCuentas.get(tx.cuenta_id)
    if (!s) continue
    const m = Number(tx.monto)
    const signo = tx.tipo === 'ingreso' ? 1 : -1
    if (tx.moneda === 'USD') s.usd += m * signo
    else s.mxn += m * signo
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
  const totalCuentasMXN = Array.from(saldoCuentas.values()).reduce((s, c) => s + c.mxn, 0)
  const totalCuentasUSD = Array.from(saldoCuentas.values()).reduce((s, c) => s + c.usd, 0)
  const proyectadoMXN = totalCuentasMXN - obligacionesMXN
  const proyectadoUSD = totalCuentasUSD - obligacionesUSD

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient">Cash Flow</h1>
          <span className="chip chip-cyan">Proyección</span>
        </div>
        <p className="text-sm text-zinc-400">Cuánto te queda si pagas TODO lo pendiente de este mes.</p>
      </header>

      {/* Resultado: cuánto te queda */}
      <section className={cn(
        'card-glow p-5 space-y-2',
        proyectadoMXN >= 0 ? 'border-emerald-500/40' : 'border-rose-500/40'
      )}>
        <div className="flex items-center gap-2">
          {proyectadoMXN >= 0 ? (
            <TrendingUp className="h-5 w-5 text-emerald-400" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-400" />
          )}
          <span className="label-caps">Disponible proyectado</span>
        </div>
        <p className={cn(
          'text-4xl font-black tabular-nums',
          proyectadoMXN >= 0 ? 'text-emerald-300' : 'text-rose-300'
        )}>
          {proyectadoMXN >= 0 ? '+' : ''}{formatMoney(proyectadoMXN, 'MXN')}
        </p>
        {(proyectadoUSD !== 0) && (
          <p className={cn(
            'text-lg font-bold tabular-nums',
            proyectadoUSD >= 0 ? 'text-emerald-300/80' : 'text-rose-300/80'
          )}>
            {proyectadoUSD >= 0 ? '+' : ''}{formatMoney(proyectadoUSD, 'USD')}
          </p>
        )}
        <p className="text-xs text-zinc-500">
          {proyectadoMXN >= 0
            ? '✓ Suficiente liquidez este mes'
            : '⚠ Faltarían recursos si pagas todo hoy'}
        </p>
      </section>

      {/* Desglose ingresos / obligaciones */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <TrendingUp className="h-4 w-4" />
            <span className="label-caps text-emerald-400">Cuentas + Ingresos del mes</span>
          </div>
          <p className="text-xl font-bold tabular-nums text-emerald-300">
            {formatMoney(totalCuentasMXN, 'MXN')}
          </p>
          {totalCuentasUSD !== 0 && (
            <p className="text-xs text-zinc-500 tabular-nums">+ {formatMoney(totalCuentasUSD, 'USD')}</p>
          )}
          <p className="text-[10px] text-zinc-500">Movimientos del mes en tus cuentas</p>
        </div>
        <div className="card p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-rose-400">
            <TrendingDown className="h-4 w-4" />
            <span className="label-caps text-rose-400">Obligaciones mensuales</span>
          </div>
          <p className="text-xl font-bold tabular-nums text-rose-300">
            {formatMoney(obligacionesMXN, 'MXN')}
          </p>
          {obligacionesUSD > 0 && (
            <p className="text-xs text-zinc-500 tabular-nums">+ {formatMoney(obligacionesUSD, 'USD')}</p>
          )}
          <p className="text-[10px] text-zinc-500">Fijos + por pagar + nómina</p>
        </div>
      </div>

      {/* Desglose detallado de obligaciones */}
      <section className="space-y-2">
        <h2 className="label-caps">Desglose de obligaciones</h2>
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-400" />
              <span className="text-sm">Gastos fijos (equivalente mensual)</span>
            </div>
            <p className="text-sm font-bold tabular-nums text-blue-300">
              {formatMoney(totalGastosFijos.mxn, 'MXN')}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-rose-400" />
              <span className="text-sm">Cuentas por pagar pendientes</span>
            </div>
            <p className="text-sm font-bold tabular-nums text-rose-300">
              {formatMoney(totalPorPagarMXN, 'MXN')}
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
            <span className="text-sm font-bold">TOTAL</span>
            <p className="text-base font-black tabular-nums text-rose-300">
              {formatMoney(obligacionesMXN, 'MXN')}
            </p>
          </div>
        </div>
      </section>

      {/* Saldo por cuenta (movimientos del mes) */}
      <section className="space-y-2">
        <h2 className="label-caps">Movimiento neto por cuenta (este mes)</h2>
        <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
          {Array.from(saldoCuentas.values()).map((c, i) => {
            const monto = c.moneda === 'USD' ? c.usd : c.mxn
            return (
              <li key={i} className="flex items-center justify-between p-3">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-cyan-400" />
                  <span className="text-sm text-white">{c.nombre}</span>
                </div>
                <p className={cn(
                  'text-sm font-bold tabular-nums',
                  monto >= 0 ? 'text-emerald-400' : 'text-rose-400'
                )}>
                  {monto >= 0 ? '+' : ''}{formatMoney(monto, c.moneda as 'MXN' | 'USD')}
                </p>
              </li>
            )
          })}
        </ul>
        <p className="text-[10px] text-zinc-500 px-1">
          ⓘ Esto es el flujo neto del mes en cada cuenta (ingresos − gastos del mes). No es el saldo bancario real.
        </p>
      </section>

      {/* Disclaimer */}
      <div className="card border-dashed p-4 space-y-1">
        <p className="text-xs text-zinc-400">
          ⓘ <strong>Cómo se calcula:</strong> sumamos todas tus entradas y salidas del mes actual, luego restamos: gastos fijos equivalentes a 1 mes + cuentas por pagar pendientes + nómina mensual estimada. No incluye saldos bancarios anteriores.
        </p>
      </div>
    </div>
  )
}
