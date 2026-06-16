/**
 * Card de inventario en el dashboard. Muestra resumen del valor total + alertas.
 * La card entera es link a /inventario. El botón "+" está posicionado absoluto
 * encima y va a /inventario/nuevo (NO se puede anidar Links en Next.js).
 */
import Link from 'next/link'
import { Package, AlertTriangle, Plus, ChevronRight } from 'lucide-react'
import { formatMoney, cn } from '@/lib/utils'

export type InventarioResumen = {
  total: number
  valor_mxn: number
  valor_usd: number
  bajo_stock: number
  agotados: number
  // Solo presentes si hay productos con costo_mxn cargado
  costo_mxn?: number
  ganancia_esperada_mxn?: number
  productos_con_costo?: number
}

export function InventarioCard({ resumen }: { resumen: InventarioResumen }) {
  if (resumen.total === 0) return null

  const hayAlertas = resumen.bajo_stock > 0 || resumen.agotados > 0

  return (
    <div className="relative">
      <Link
        href="/inventario"
        className="block group rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-cyan-500/5 to-transparent p-4 active:scale-[0.99] transition-all hover:border-emerald-500/40"
      >
        <div className="flex items-start gap-2 mb-3 pr-12">
          <span className="h-9 w-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 inline-flex items-center justify-center">
            <Package className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold text-zinc-100">Inventario</p>
            <p className="text-[10px] text-zinc-500">Cvu Pharmacy local</p>
          </div>
        </div>

        {/* Valor total destacado */}
        <div className="mb-3">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Valor de venta</p>
          <p className="text-2xl font-black text-emerald-300 tabular-nums leading-tight">
            {formatMoney(resumen.valor_mxn, 'MXN')}
          </p>
          <p className="text-[11px] text-cyan-300/80 tabular-nums">
            ≈ {formatMoney(resumen.valor_usd, 'USD')}
          </p>
        </div>

        {/* Ganancia esperada (solo si hay costos cargados) */}
        {resumen.ganancia_esperada_mxn != null && (
          <div className="mb-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                  Ganancia esperada
                </p>
                <p className="text-lg font-black text-cyan-300 tabular-nums leading-tight">
                  {formatMoney(resumen.ganancia_esperada_mxn, 'MXN')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-zinc-500">Costo total</p>
                <p className="text-sm font-bold text-zinc-300 tabular-nums">
                  {formatMoney(resumen.costo_mxn ?? 0, 'MXN')}
                </p>
                <p className="text-[9px] text-zinc-500">
                  {resumen.productos_con_costo}/{resumen.total} con costo
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats secundarios */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 py-1.5">
            <p className="text-base font-bold text-zinc-100 tabular-nums leading-none">{resumen.total}</p>
            <p className="text-[9px] text-zinc-500 uppercase tracking-wider mt-0.5">Productos</p>
          </div>
          <div className={cn(
            'rounded-lg py-1.5 border',
            resumen.bajo_stock > 0
              ? 'bg-amber-500/10 border-amber-500/30'
              : 'bg-zinc-900/40 border-zinc-800'
          )}>
            <p className={cn(
              'text-base font-bold tabular-nums leading-none',
              resumen.bajo_stock > 0 ? 'text-amber-300' : 'text-zinc-400'
            )}>{resumen.bajo_stock}</p>
            <p className={cn(
              'text-[9px] uppercase tracking-wider mt-0.5',
              resumen.bajo_stock > 0 ? 'text-amber-200/70' : 'text-zinc-500'
            )}>Bajo stock</p>
          </div>
          <div className={cn(
            'rounded-lg py-1.5 border',
            resumen.agotados > 0
              ? 'bg-rose-500/10 border-rose-500/30'
              : 'bg-zinc-900/40 border-zinc-800'
          )}>
            <p className={cn(
              'text-base font-bold tabular-nums leading-none',
              resumen.agotados > 0 ? 'text-rose-300' : 'text-zinc-400'
            )}>{resumen.agotados}</p>
            <p className={cn(
              'text-[9px] uppercase tracking-wider mt-0.5',
              resumen.agotados > 0 ? 'text-rose-200/70' : 'text-zinc-500'
            )}>Agotados</p>
          </div>
        </div>

        {hayAlertas && (
          <p className="text-[10px] text-amber-300/80 mt-2 inline-flex items-center gap-1 pr-32">
            <AlertTriangle className="h-3 w-3" />
            {resumen.agotados + resumen.bajo_stock} producto{resumen.agotados + resumen.bajo_stock === 1 ? '' : 's'} necesitan atención
          </p>
        )}
      </Link>

      {/* Botón "+" flotante para crear producto, FUERA del Link principal */}
      <Link
        href="/inventario/nuevo"
        className="absolute top-4 right-4 z-10 h-8 w-8 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center shadow-lg shadow-emerald-500/30 hover:bg-emerald-500 active:scale-95 transition-all"
        aria-label="Nuevo producto"
      >
        <Plus className="h-4 w-4" />
      </Link>

      {/* CTA "Ver críticos" — sibling Link, abajo a la derecha cuando hay alertas */}
      {hayAlertas && (
        <Link
          href="/inventario?bajo_stock=1"
          className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 text-[10px] font-bold text-amber-200 hover:bg-amber-500/25 active:scale-95 transition-all"
          aria-label="Ver productos críticos"
        >
          Ver críticos
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}
