'use client'

/**
 * Lista de productos del inventario con filtros y búsqueda en cliente.
 * Conversión USD en vivo con el rate pasado del server.
 */
import { useMemo, useState } from 'react'
import { Search, Filter, X } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'

export type Producto = {
  id: string
  nombre: string
  precio_mxn: number
  stock: number
  unidad_stock: string
  categoria: string | null
  codigo_barras: string | null
  stock_minimo: number
}

export function InventarioListaClient({
  productos,
  categorias,
  rate,
  filtroInicial,
}: {
  productos: Producto[]
  categorias: string[]
  rate: number
  filtroInicial: { categoria: string; q: string; bajoStock: boolean }
}) {
  const [q, setQ] = useState(filtroInicial.q)
  const [categoria, setCategoria] = useState(filtroInicial.categoria)
  const [bajoStock, setBajoStock] = useState(filtroInicial.bajoStock)

  const filtrados = useMemo(() => {
    const qn = q.trim().toLowerCase()
    return productos.filter(p => {
      if (categoria && p.categoria !== categoria) return false
      if (bajoStock && p.stock > p.stock_minimo) return false
      if (qn) {
        const en = (p.nombre + ' ' + (p.codigo_barras ?? '')).toLowerCase()
        if (!en.includes(qn)) return false
      }
      return true
    })
  }, [productos, q, categoria, bajoStock])

  const limpiar = () => { setQ(''); setCategoria(''); setBajoStock(false) }
  const hayFiltros = !!q || !!categoria || bajoStock

  return (
    <div className="space-y-3">
      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar producto o código de barras..."
          className="w-full h-11 pl-9 pr-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm"
        />
        {q && (
          <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="h-4 w-4 text-zinc-500" />
          </button>
        )}
      </div>

      {/* Chips de categorías */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          type="button"
          onClick={() => setCategoria('')}
          className={cn(
            'shrink-0 h-8 px-3 rounded-full text-xs border transition-colors',
            !categoria
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-[var(--border-subtle)] text-zinc-400'
          )}
        >
          Todas ({productos.length})
        </button>
        {categorias.map((c) => {
          const count = productos.filter(p => p.categoria === c).length
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategoria(categoria === c ? '' : c)}
              className={cn(
                'shrink-0 h-8 px-3 rounded-full text-xs border transition-colors',
                categoria === c
                  ? 'border-cyan-600 bg-cyan-600 text-white'
                  : 'border-[var(--border-subtle)] text-zinc-400'
              )}
            >
              {c} ({count})
            </button>
          )
        })}
      </div>

      {/* Toggle bajo stock + clear */}
      <div className="flex items-center justify-between text-xs">
        <label className="inline-flex items-center gap-1.5 text-zinc-400">
          <input
            type="checkbox"
            checked={bajoStock}
            onChange={(e) => setBajoStock(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Solo bajo stock o agotados
        </label>
        {hayFiltros && (
          <button onClick={limpiar} className="text-cyan-400 inline-flex items-center gap-1">
            <X className="h-3 w-3" />
            Limpiar filtros
          </button>
        )}
      </div>

      <p className="text-xs text-zinc-500">
        Mostrando {filtrados.length} de {productos.length} productos
      </p>

      {/* Lista */}
      <ul className="space-y-1.5">
        {filtrados.map((p) => {
          const usd = p.precio_mxn / rate
          const stockColor =
            p.stock === 0 ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
            : p.stock <= p.stock_minimo ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'

          return (
            <li
              key={p.id}
              className="card p-3 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0 leading-tight">
                <p className="text-sm font-semibold truncate text-zinc-100">{p.nombre}</p>
                <p className="text-[10px] text-zinc-500 truncate">
                  {p.categoria ?? 'Sin categoría'}
                  {p.codigo_barras && ` · ${p.codigo_barras}`}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold tabular-nums text-emerald-300">
                  {formatMoney(p.precio_mxn, 'MXN')}
                </p>
                <p className="text-[10px] tabular-nums text-cyan-300/80">
                  ≈ {formatMoney(usd, 'USD')}
                </p>
              </div>
              <span className={cn(
                'inline-flex items-center justify-center min-w-[44px] px-2 h-7 rounded-md border text-[11px] font-bold tabular-nums',
                stockColor
              )}>
                {p.stock} {p.unidad_stock}
              </span>
            </li>
          )
        })}
        {filtrados.length === 0 && (
          <li className="card p-6 text-center text-sm text-zinc-500">
            No hay productos con esos filtros.
          </li>
        )}
      </ul>
    </div>
  )
}
