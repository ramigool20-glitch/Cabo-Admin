/**
 * Inventario de farmacia (por default Cvu Pharmacy local).
 * Lista todos los productos con stock, precio MXN y conversión USD live.
 * Filtros por categoría + búsqueda por nombre/código.
 */
import { Package, AlertTriangle, DollarSign } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney } from '@/lib/utils'
import { InventarioListaClient } from '@/components/inventario/inventario-lista-client'

export const dynamic = 'force-dynamic'

type SearchParams = { categoria?: string; q?: string; bajo_stock?: string }

export default async function InventarioPage(
  { searchParams }: { searchParams: Promise<SearchParams> }
) {
  const sp = await searchParams
  const admin = createAdminClient()

  // Pull el fx_rate más reciente para conversión MXN→USD
  const { data: fxRate } = await admin
    .from('fx_rates')
    .select('rate_compra, mid_rate, fecha')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  // Usamos mid_rate para mostrar "≈ USD" porque es el más justo para info
  const rate = fxRate ? Number(fxRate.mid_rate ?? fxRate.rate_compra) : 17

  // Lista total + agregados (sin filtrar — para totales)
  const { data: todos } = await admin
    .from('inventario_productos')
    .select('id, nombre, precio_mxn, stock, unidad_stock, categoria, codigo_barras, stock_minimo, activo')
    .eq('activo', true)
    .order('nombre')

  const productos = todos ?? []
  const totalProductos = productos.length
  const totalStockUnidades = productos.reduce((s, p) => s + Number(p.stock || 0), 0)
  const valorInventarioMxn = productos.reduce((s, p) => s + Number(p.precio_mxn || 0) * Number(p.stock || 0), 0)
  const valorInventarioUsd = valorInventarioMxn / rate
  const enBajoStock = productos.filter(p => Number(p.stock || 0) <= Number(p.stock_minimo ?? 3) && Number(p.stock || 0) > 0).length
  const enCero = productos.filter(p => Number(p.stock || 0) === 0).length

  // Categorías únicas
  const categorias = Array.from(new Set(productos.map(p => p.categoria).filter(Boolean) as string[])).sort()

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-5xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient flex items-center gap-2">
          <Package className="h-6 w-6 text-emerald-400" />
          Inventario
        </h1>
        <p className="text-xs text-zinc-500">
          Cvu Pharmacy local · Tipo de cambio actual: <span className="text-cyan-300 font-mono">${rate.toFixed(2)} MXN/USD</span>
        </p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="card p-3 space-y-0.5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Productos</p>
          <p className="text-xl font-black text-emerald-300 tabular-nums">{totalProductos}</p>
          <p className="text-[10px] text-zinc-500">{totalStockUnidades} unidades</p>
        </div>
        <div className="card p-3 space-y-0.5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Valor inventario</p>
          <p className="text-xl font-black text-cyan-300 tabular-nums">{formatMoney(valorInventarioMxn, 'MXN')}</p>
          <p className="text-[10px] text-zinc-500">≈ {formatMoney(valorInventarioUsd, 'USD')}</p>
        </div>
        <div className="card p-3 space-y-0.5 border-amber-500/30">
          <p className="text-[10px] text-amber-200 uppercase tracking-wider font-semibold inline-flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Bajo stock
          </p>
          <p className="text-xl font-black text-amber-300 tabular-nums">{enBajoStock}</p>
          <p className="text-[10px] text-zinc-500">≤ 3 unidades</p>
        </div>
        <div className="card p-3 space-y-0.5 border-rose-500/30">
          <p className="text-[10px] text-rose-200 uppercase tracking-wider font-semibold inline-flex items-center gap-1">
            <DollarSign className="h-3 w-3" /> Agotados
          </p>
          <p className="text-xl font-black text-rose-300 tabular-nums">{enCero}</p>
          <p className="text-[10px] text-zinc-500">0 stock</p>
        </div>
      </div>

      <InventarioListaClient
        productos={productos.map(p => ({
          id: p.id,
          nombre: p.nombre,
          precio_mxn: Number(p.precio_mxn || 0),
          stock: Number(p.stock || 0),
          unidad_stock: p.unidad_stock || 'unidad',
          categoria: p.categoria || null,
          codigo_barras: p.codigo_barras || null,
          stock_minimo: Number(p.stock_minimo ?? 3),
        }))}
        categorias={categorias}
        rate={rate}
        filtroInicial={{
          categoria: sp.categoria ?? '',
          q: sp.q ?? '',
          bajoStock: sp.bajo_stock === '1',
        }}
      />
    </div>
  )
}
