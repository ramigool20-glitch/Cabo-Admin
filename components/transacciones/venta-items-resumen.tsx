/**
 * Muestra los items vendidos en una transacción con ganancia.
 * Solo se renderiza si la transacción tiene items (tiene_items=true).
 */

import { ShoppingBag, TrendingUp } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'

export type VentaItemRow = {
  id: string
  nombre_snapshot: string
  codigo_barras_snapshot: string | null
  categoria_snapshot: string | null
  cantidad: number
  precio_unitario_mxn: number
  costo_unitario_snapshot_mxn: number | null
  descuento_pct: number
  descuento_mxn: number
  subtotal_mxn: number
  ganancia_mxn: number | null
}

export function VentaItemsResumen({
  items,
  gananciaTotal,
  costoTotal,
}: {
  items: VentaItemRow[]
  gananciaTotal: number | null
  costoTotal: number | null
}) {
  if (!items || items.length === 0) return null

  const subtotal = items.reduce((s, i) => s + i.subtotal_mxn, 0)
  const margenPct = subtotal > 0 && gananciaTotal != null
    ? (gananciaTotal / subtotal) * 100
    : null

  return (
    <section className="space-y-3">
      {/* Header con resumen visual */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 p-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 inline-flex items-center justify-center">
            <ShoppingBag className="h-4 w-4 text-emerald-300" />
          </div>
          <div>
            <p className="text-sm font-black text-zinc-100">Venta de productos</p>
            <p className="text-[10px] text-zinc-500">{items.length} {items.length === 1 ? 'producto' : 'productos'} · Stock descontado del inventario</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 p-2">
            <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Ingreso</p>
            <p className="text-sm font-black text-emerald-300 tabular-nums leading-tight">
              {formatMoney(subtotal, 'MXN')}
            </p>
          </div>
          <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 p-2">
            <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">Costo</p>
            <p className="text-sm font-black text-rose-300 tabular-nums leading-tight">
              {costoTotal != null ? formatMoney(costoTotal, 'MXN') : '—'}
            </p>
          </div>
          <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/30 p-2">
            <p className="text-[9px] uppercase tracking-wider text-cyan-300 font-bold inline-flex items-center gap-0.5">
              <TrendingUp className="h-2.5 w-2.5" />
              Ganancia
            </p>
            <p className="text-sm font-black text-cyan-300 tabular-nums leading-tight">
              {gananciaTotal != null ? formatMoney(gananciaTotal, 'MXN') : '—'}
            </p>
            {margenPct != null && (
              <p className="text-[9px] text-cyan-200/70 leading-tight">{margenPct.toFixed(1)}% margen</p>
            )}
          </div>
        </div>
      </div>

      {/* Tabla de items */}
      <ul className="space-y-1.5">
        {items.map((it) => {
          const margenItem = it.ganancia_mxn != null && it.subtotal_mxn > 0
            ? (it.ganancia_mxn / it.subtotal_mxn) * 100
            : null
          return (
            <li key={it.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-100 leading-tight">{it.nombre_snapshot}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {it.cantidad} × {formatMoney(it.precio_unitario_mxn, 'MXN')}
                    {it.descuento_mxn > 0 && (
                      <span className="text-rose-300/80 ml-1">-{it.descuento_pct.toFixed(1)}%</span>
                    )}
                    {it.codigo_barras_snapshot && ` · ${it.codigo_barras_snapshot}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-emerald-300 tabular-nums leading-tight">
                    {formatMoney(it.subtotal_mxn, 'MXN')}
                  </p>
                  {it.ganancia_mxn != null && margenItem != null && (
                    <p className={cn(
                      'text-[10px] tabular-nums leading-tight',
                      margenItem >= 30 ? 'text-emerald-300' :
                      margenItem >= 10 ? 'text-amber-300' :
                      'text-rose-300'
                    )}>
                      +{formatMoney(it.ganancia_mxn, 'MXN')} ({margenItem.toFixed(0)}%)
                    </p>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
