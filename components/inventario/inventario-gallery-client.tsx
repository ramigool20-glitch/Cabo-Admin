'use client'

/**
 * Galería de productos estilo POS premium. Toggle entre grid (cards visuales
 * con foto) y lista (más datos por fila). Tap en una card abre el sheet de
 * detalle con edición inline + foto opcional.
 */
import { useMemo, useState } from 'react'
import { Search, X, Grid3x3, List, Camera } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { ProductoSheet } from '@/components/inventario/producto-sheet'

export type Producto = {
  id: string
  nombre: string
  precio_mxn: number
  stock: number
  unidad_stock: string
  categoria: string | null
  codigo_barras: string | null
  stock_minimo: number
  foto_path: string | null
  foto_signed_url: string | null
  // Campos 0041 — opcionales, pueden ser null si la migración no se aplicó
  sku?: string | null
  marca?: string | null
  ubicacion?: string | null
  descripcion?: string | null
  costo_mxn?: number | null
  cobra_iva?: boolean
  requiere_receta?: boolean
  lote?: string | null
  fecha_caducidad?: string | null
  clave_sat?: string | null
  vende_pos?: boolean
}

const EMOJI_CAT: Record<string, string> = {
  GENERICO: '💊',
  PATENTE: '🏥',
  OTC: '🩹',
  'Cuidado Personal': '🧴',
  Bebidas: '🥤',
  'Departamento de bebe': '👶',
  Antiácido: '🌿',
  Choco: '🍫',
}

export function InventarioGalleryClient({
  productos,
  categorias,
  rate,
  fotoUrlActiva,
  extendidoActivo = true,
  filtroInicial,
}: {
  productos: Producto[]
  categorias: string[]
  rate: number
  fotoUrlActiva: boolean
  extendidoActivo?: boolean
  filtroInicial: { categoria: string; q: string; bajoStock: boolean; agotados: boolean; vista: 'grid' | 'lista' }
}) {
  const [q, setQ] = useState(filtroInicial.q)
  const [categoria, setCategoria] = useState(filtroInicial.categoria)
  const [bajoStock, setBajoStock] = useState(filtroInicial.bajoStock)
  const [agotados, setAgotados] = useState(filtroInicial.agotados)
  const [vista, setVista] = useState<'grid' | 'lista'>(filtroInicial.vista)
  const [productoAbierto, setProductoAbierto] = useState<Producto | null>(null)

  const filtrados = useMemo(() => {
    const qn = q.trim().toLowerCase()
    return productos.filter(p => {
      if (categoria && p.categoria !== categoria) return false
      if (agotados && p.stock !== 0) return false
      if (bajoStock && !agotados && (p.stock === 0 || p.stock > p.stock_minimo)) return false
      if (qn) {
        const en = (p.nombre + ' ' + (p.codigo_barras ?? '')).toLowerCase()
        if (!en.includes(qn)) return false
      }
      return true
    })
  }, [productos, q, categoria, bajoStock, agotados])

  const limpiar = () => { setQ(''); setCategoria(''); setBajoStock(false); setAgotados(false) }
  const hayFiltros = !!q || !!categoria || bajoStock || agotados

  return (
    <>
      <div className="space-y-3">
        {/* Búsqueda */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar producto o código de barras..."
            className="w-full h-12 pl-9 pr-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {q && (
            <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-zinc-500" />
            </button>
          )}
        </div>

        {/* Chips categorías */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            type="button"
            onClick={() => setCategoria('')}
            className={cn(
              'shrink-0 h-8 px-3 rounded-full text-xs border transition-all',
              !categoria
                ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                : 'border-[var(--border-subtle)] text-zinc-400 hover:border-zinc-500'
            )}
          >
            Todas ({productos.length})
          </button>
          {categorias.map((c) => {
            const count = productos.filter(p => p.categoria === c).length
            const em = EMOJI_CAT[c] ?? '📦'
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategoria(categoria === c ? '' : c)}
                className={cn(
                  'shrink-0 h-8 px-3 rounded-full text-xs border transition-all inline-flex items-center gap-1',
                  categoria === c
                    ? 'border-cyan-500 bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                    : 'border-[var(--border-subtle)] text-zinc-400 hover:border-zinc-500'
                )}
              >
                <span>{em}</span>
                <span>{c}</span>
                <span className="opacity-60">({count})</span>
              </button>
            )
          })}
        </div>

        {/* Toggle vista + bajo stock + clear */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="inline-flex items-center gap-1.5 text-zinc-400">
              <input
                type="checkbox"
                checked={bajoStock}
                onChange={(e) => { setBajoStock(e.target.checked); if (e.target.checked) setAgotados(false) }}
                className="h-3.5 w-3.5 accent-amber-500"
              />
              Solo bajo stock
            </label>
            <label className="inline-flex items-center gap-1.5 text-zinc-400">
              <input
                type="checkbox"
                checked={agotados}
                onChange={(e) => { setAgotados(e.target.checked); if (e.target.checked) setBajoStock(false) }}
                className="h-3.5 w-3.5 accent-rose-500"
              />
              Solo agotados
            </label>
            {hayFiltros && (
              <button onClick={limpiar} className="text-cyan-400 inline-flex items-center gap-1">
                <X className="h-3 w-3" /> Limpiar
              </button>
            )}
          </div>

          {/* Toggle vista */}
          <div className="inline-flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] overflow-hidden">
            <button
              type="button"
              onClick={() => setVista('grid')}
              className={cn(
                'h-8 px-2.5 inline-flex items-center gap-1 transition-colors',
                vista === 'grid' ? 'bg-emerald-600 text-white' : 'text-zinc-500'
              )}
            >
              <Grid3x3 className="h-3.5 w-3.5" />
              Grid
            </button>
            <button
              type="button"
              onClick={() => setVista('lista')}
              className={cn(
                'h-8 px-2.5 inline-flex items-center gap-1 transition-colors',
                vista === 'lista' ? 'bg-emerald-600 text-white' : 'text-zinc-500'
              )}
            >
              <List className="h-3.5 w-3.5" />
              Lista
            </button>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500">
          {filtrados.length} de {productos.length} productos
        </p>

        {/* Render según vista */}
        {vista === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtrados.map((p) => (
              <ProductoCardGrid key={p.id} p={p} rate={rate} onTap={() => setProductoAbierto(p)} />
            ))}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {filtrados.map((p) => (
              <ProductoCardLista key={p.id} p={p} rate={rate} onTap={() => setProductoAbierto(p)} />
            ))}
          </ul>
        )}

        {filtrados.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)]/40 p-10 text-center">
            <p className="text-sm text-zinc-500">Sin productos con esos filtros</p>
          </div>
        )}
      </div>

      {/* Sheet de detalle */}
      {productoAbierto && (
        <ProductoSheet
          producto={productoAbierto}
          rate={rate}
          fotoUrlActiva={fotoUrlActiva}
          categoriasDisponibles={categorias}
          onClose={() => setProductoAbierto(null)}
        />
      )}
    </>
  )
}

function stockClasses(stock: number, minimo: number) {
  if (stock === 0) return { pill: 'bg-rose-500/15 text-rose-300 border-rose-500/40', dot: 'bg-rose-500' }
  if (stock <= minimo) return { pill: 'bg-amber-500/15 text-amber-300 border-amber-500/40', dot: 'bg-amber-500' }
  return { pill: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', dot: 'bg-emerald-500' }
}

/** Devuelve días hasta caducidad, o null si no aplica. Negativo si ya caducó. */
function diasACaducidad(fecha?: string | null): number | null {
  if (!fecha) return null
  const f = new Date(fecha + 'T00:00:00')
  if (isNaN(f.getTime())) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.floor((f.getTime() - hoy.getTime()) / 86_400_000)
}

function CaducidadBadge({ dias }: { dias: number }) {
  if (dias < 0) return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 px-1.5 h-5 text-[9px] font-bold text-rose-200 backdrop-blur">
      ⚠ vencido
    </span>
  )
  if (dias <= 30) return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 px-1.5 h-5 text-[9px] font-bold text-rose-200 backdrop-blur">
      ⏰ {dias}d
    </span>
  )
  if (dias <= 90) return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 h-5 text-[9px] font-bold text-amber-200 backdrop-blur">
      ⏰ {dias}d
    </span>
  )
  return null
}

function RxBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 px-1.5 h-5 text-[9px] font-bold text-purple-200 backdrop-blur">
      🩺 Rx
    </span>
  )
}

function ProductoCardGrid({ p, rate, onTap }: { p: Producto; rate: number; onTap: () => void }) {
  const usd = p.precio_mxn / rate
  const sc = stockClasses(p.stock, p.stock_minimo)
  // Para Choco, el placeholder siempre es la caja (no el chocolate) — preferencia del usuario.
  // El emoji de la categoría sigue saliendo en los chips de filtro.
  const emoji = p.categoria === 'Choco' ? '📦' : (EMOJI_CAT[p.categoria ?? ''] ?? '📦')

  return (
    <button
      type="button"
      onClick={onTap}
      className="text-left group rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10 active:scale-[0.98] transition-all"
    >
      {/* Foto / placeholder */}
      <div className="relative aspect-square bg-gradient-to-br from-zinc-900/80 to-zinc-950 flex items-center justify-center overflow-hidden">
        {p.foto_signed_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={p.foto_signed_url} alt={p.nombre} className="w-full h-full object-cover" />
        ) : (
          <div className="text-5xl opacity-50 group-hover:opacity-70 transition-opacity">{emoji}</div>
        )}
        {/* Stock pill flotante en esquina */}
        <div className={cn(
          'absolute top-2 right-2 inline-flex items-center gap-1 px-2 h-6 rounded-full border text-[10px] font-bold tabular-nums backdrop-blur',
          sc.pill
        )}>
          <span className={cn('inline-block h-1.5 w-1.5 rounded-full', sc.dot)} />
          {p.stock}
        </div>
        {/* Badges en esquina superior izquierda: Rx + caducidad */}
        {(p.requiere_receta || p.fecha_caducidad) && (
          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
            {p.requiere_receta && <RxBadge />}
            {(() => {
              const d = diasACaducidad(p.fecha_caducidad)
              return d !== null ? <CaducidadBadge dias={d} /> : null
            })()}
          </div>
        )}
      </div>
      {/* Info */}
      <div className="p-2.5 space-y-0.5">
        <p className="text-[11px] text-zinc-500 leading-tight truncate uppercase tracking-wider font-semibold">
          {p.categoria ?? '—'}
        </p>
        <p className="text-sm font-bold text-zinc-100 leading-tight line-clamp-2 min-h-[36px]">
          {p.nombre}
        </p>
        <div className="flex items-end justify-between pt-1.5 gap-2">
          {/* Precio MXN principal */}
          <div className="min-w-0 flex-1">
            <p className="text-base font-black text-emerald-300 tabular-nums leading-none">
              {formatMoney(p.precio_mxn, 'MXN')}
            </p>
            <p className="text-[8px] uppercase tracking-[0.15em] text-zinc-600 font-bold mt-0.5">MXN</p>
          </div>
          {/* Precio USD pill premium */}
          <PrecioUsdPill usd={usd} />
        </div>
      </div>
    </button>
  )
}

/** Pill premium para mostrar el precio USD con bandera + label */
function PrecioUsdPill({ usd, size = 'md' }: { usd: number; size?: 'sm' | 'md' }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 to-blue-500/5 backdrop-blur-sm shrink-0',
      size === 'sm' ? 'px-1.5 h-5' : 'px-2 h-7'
    )}>
      <span className={size === 'sm' ? 'text-[9px]' : 'text-[11px]'} aria-hidden>🇺🇸</span>
      <div className="flex items-baseline gap-0.5 leading-none">
        <span className={cn(
          'font-black text-cyan-200 tabular-nums tracking-tight',
          size === 'sm' ? 'text-[10px]' : 'text-xs'
        )}>
          ${usd.toFixed(2)}
        </span>
        <span className={cn(
          'font-bold text-cyan-400/70 tracking-wider',
          size === 'sm' ? 'text-[7px]' : 'text-[8px]'
        )}>USD</span>
      </div>
    </span>
  )
}

function ProductoCardLista({ p, rate, onTap }: { p: Producto; rate: number; onTap: () => void }) {
  const usd = p.precio_mxn / rate
  const sc = stockClasses(p.stock, p.stock_minimo)
  const emoji = p.categoria === 'Choco' ? '📦' : (EMOJI_CAT[p.categoria ?? ''] ?? '📦')
  const diasCad = diasACaducidad(p.fecha_caducidad)
  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        className="w-full text-left card p-3 flex items-center gap-3 hover:bg-[var(--bg-card-hover)] active:bg-[var(--bg-card-hover)]/80 transition-colors"
      >
        <div className="h-12 w-12 rounded-lg overflow-hidden bg-zinc-900 flex items-center justify-center shrink-0 border border-zinc-800">
          {p.foto_signed_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={p.foto_signed_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-2xl opacity-60">{emoji}</span>
          )}
        </div>
        <div className="flex-1 min-w-0 leading-tight">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-zinc-100 truncate">{p.nombre}</p>
            {p.requiere_receta && <RxBadge />}
            {diasCad !== null && <CaducidadBadge dias={diasCad} />}
          </div>
          <p className="text-[10px] text-zinc-500 truncate">
            {p.categoria ?? '—'}
            {p.codigo_barras && ` · ${p.codigo_barras}`}
            {p.ubicacion && ` · 📍 ${p.ubicacion}`}
          </p>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
          <p className="text-sm font-bold text-emerald-300 tabular-nums leading-none">
            {formatMoney(p.precio_mxn, 'MXN')}
          </p>
          <PrecioUsdPill usd={usd} size="sm" />
        </div>
        <div className={cn(
          'inline-flex items-center justify-center gap-1 min-w-[52px] px-2 h-7 rounded-md border text-[11px] font-bold tabular-nums',
          sc.pill
        )}>
          <span className={cn('inline-block h-1.5 w-1.5 rounded-full', sc.dot)} />
          {p.stock}
        </div>
      </button>
    </li>
  )
}
