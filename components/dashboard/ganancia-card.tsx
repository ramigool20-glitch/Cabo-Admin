/**
 * Card de ganancia REAL en el dashboard.
 *
 * Muestra:
 *   - Ganancia bruta del periodo (suma de ventas con items)
 *   - Comparativo vs periodo anterior con flecha (↑↓)
 *   - COGS (costo de productos vendidos)
 *   - Margen bruto %
 *   - Top 3 productos por ganancia (link a inventario)
 *
 * Solo aparece si hay al menos una transacción con tiene_items=true.
 */

import Link from 'next/link'
import { TrendingUp, TrendingDown, ShoppingBag, ChevronRight, Minus } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'

export type GananciaResumen = {
  // Periodo actual
  ingresos_mxn: number
  costo_mxn: number
  ganancia_mxn: number
  margen_pct: number
  ventas_count: number       // # de transacciones con items
  unidades_vendidas: number
  // Periodo anterior (para comparar)
  ganancia_anterior_mxn: number | null
  margen_anterior_pct: number | null
  // Top productos
  top_productos: Array<{
    nombre: string
    ganancia_mxn: number
    unidades: number
  }>
  // Label del periodo (ej "Este mes")
  periodo_label: string
}

export function GananciaCard({ resumen }: { resumen: GananciaResumen }) {
  if (resumen.ventas_count === 0) return null

  const tieneAnterior = resumen.ganancia_anterior_mxn != null && resumen.ganancia_anterior_mxn !== 0
  const variacion = tieneAnterior
    ? ((resumen.ganancia_mxn - (resumen.ganancia_anterior_mxn ?? 0)) / Math.abs(resumen.ganancia_anterior_mxn ?? 1)) * 100
    : null
  const subio = variacion != null && variacion >= 0

  return (
    <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/5 via-emerald-500/5 to-transparent p-4 space-y-3 relative overflow-hidden">
      {/* Decoración */}
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-cyan-500/5 blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500/30 to-emerald-500/30 inline-flex items-center justify-center shrink-0">
          <TrendingUp className="h-5 w-5 text-cyan-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-zinc-100 leading-tight">Ganancia bruta</p>
          <p className="text-[10px] text-zinc-500">{resumen.periodo_label} · {resumen.ventas_count} venta{resumen.ventas_count === 1 ? '' : 's'}</p>
        </div>
      </div>

      {/* Ganancia destacada + comparativo */}
      <div className="space-y-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-3xl font-black text-cyan-300 tabular-nums leading-none">
            {formatMoney(resumen.ganancia_mxn, 'MXN')}
          </p>
          {variacion != null && (
            <span className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-2 h-6 text-[11px] font-bold tabular-nums',
              subio
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
            )}>
              {subio ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {subio ? '+' : ''}{variacion.toFixed(0)}%
            </span>
          )}
        </div>
        <p className="text-[11px] text-zinc-500">
          {resumen.margen_pct.toFixed(1)}% margen
          {resumen.margen_anterior_pct != null && (
            <span className="text-zinc-600"> · {resumen.margen_anterior_pct.toFixed(1)}% periodo anterior</span>
          )}
        </p>
      </div>

      {/* 3 KPIs secundarios */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 p-2">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Ingresos</p>
          <p className="text-sm font-black text-emerald-300 tabular-nums leading-tight truncate">
            {fmt(resumen.ingresos_mxn)}
          </p>
        </div>
        <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 p-2">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">COGS</p>
          <p className="text-sm font-black text-rose-300 tabular-nums leading-tight truncate">
            {fmt(resumen.costo_mxn)}
          </p>
          <p className="text-[8px] text-zinc-600 leading-none">Costo vendido</p>
        </div>
        <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 p-2">
          <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Unidades</p>
          <p className="text-sm font-black text-zinc-100 tabular-nums leading-tight">
            {resumen.unidades_vendidas}
          </p>
          <p className="text-[8px] text-zinc-600 leading-none">vendidas</p>
        </div>
      </div>

      {/* Top productos */}
      {resumen.top_productos.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Top por ganancia</p>
          <ul className="space-y-1">
            {resumen.top_productos.map((p, idx) => (
              <li key={idx} className="flex items-center gap-2">
                <span className={cn(
                  'h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0',
                  idx === 0 && 'bg-amber-500/20 text-amber-200 border border-amber-500/30',
                  idx === 1 && 'bg-zinc-700/40 text-zinc-300 border border-zinc-700',
                  idx === 2 && 'bg-orange-500/20 text-orange-200 border border-orange-500/30',
                )}>
                  {idx + 1}
                </span>
                <p className="text-xs text-zinc-200 truncate flex-1">{p.nombre}</p>
                <p className="text-xs font-bold text-cyan-300 tabular-nums shrink-0">+{fmt(p.ganancia_mxn)}</p>
                <span className="text-[9px] text-zinc-500 shrink-0">{p.unidades}u</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTA */}
      <Link
        href="/transacciones?categoria=Venta+de+productos"
        className="flex items-center justify-between text-xs text-cyan-400 hover:text-cyan-300 pt-2 border-t border-zinc-800"
      >
        <span className="inline-flex items-center gap-1">
          <ShoppingBag className="h-3 w-3" />
          Ver todas las ventas
        </span>
        <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  )
}

/** Empty state: cuando no hay ventas todavía, motivar a registrar la primera */
export function GananciaEmpty() {
  return (
    <div className="rounded-2xl border border-dashed border-cyan-500/30 bg-cyan-500/5 p-4 space-y-2">
      <div className="flex items-start gap-2.5">
        <div className="h-10 w-10 rounded-xl bg-cyan-500/10 inline-flex items-center justify-center shrink-0">
          <Minus className="h-5 w-5 text-cyan-300" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-zinc-100">Aún sin ventas registradas</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Registra una venta con productos para ver tu ganancia bruta, COGS y margen real.
          </p>
        </div>
      </div>
      <Link
        href="/transacciones/venta"
        className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-emerald-600 text-white text-xs font-bold active:scale-95"
      >
        <ShoppingBag className="h-3.5 w-3.5" />
        Registrar primera venta
      </Link>
    </div>
  )
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 10_000) return '$' + Math.round(n).toLocaleString('es-MX')
  return formatMoney(n, 'MXN')
}
