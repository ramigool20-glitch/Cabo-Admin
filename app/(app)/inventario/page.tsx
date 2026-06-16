/**
 * Inventario premium POS-style. Grid de cards con foto, precio, stock pill.
 * Tap en una card → sheet de detalle con edición inline + foto opcional.
 */
import { Package, AlertTriangle, DollarSign, Sparkles } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney } from '@/lib/utils'
import { InventarioGalleryClient } from '@/components/inventario/inventario-gallery-client'

export const dynamic = 'force-dynamic'

type SearchParams = { categoria?: string; q?: string; bajo_stock?: string; vista?: string }

export default async function InventarioPage(
  { searchParams }: { searchParams: Promise<SearchParams> }
) {
  const sp = await searchParams
  const admin = createAdminClient()

  // FX rate del día para conversión USD
  const { data: fxRate } = await admin
    .from('fx_rates')
    .select('mid_rate, rate_compra, fecha')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  const rate = fxRate ? Number(fxRate.mid_rate ?? fxRate.rate_compra) : 17

  // Defensive: si la migración 0040 (foto_url) aún no se aplicó, hacemos retry sin esa columna
  const baseCols = 'id, nombre, precio_mxn, stock, unidad_stock, categoria, codigo_barras, stock_minimo, activo'
  let rows: Array<Record<string, unknown>> = []
  let fotoUrlActiva = true
  const respWith = await admin
    .from('inventario_productos')
    .select(`${baseCols}, foto_url`)
    .eq('activo', true)
    .order('nombre')
  if (respWith.error && /foto_url/i.test(respWith.error.message ?? '')) {
    fotoUrlActiva = false
    const respWithout = await admin
      .from('inventario_productos')
      .select(baseCols)
      .eq('activo', true)
      .order('nombre')
    rows = (respWithout.data ?? []) as unknown as Array<Record<string, unknown>>
  } else {
    rows = (respWith.data ?? []) as unknown as Array<Record<string, unknown>>
  }

  // Generar signed URLs para fotos (8h) si está activa la columna
  type ProductoConFoto = {
    id: string; nombre: string; precio_mxn: number; stock: number; unidad_stock: string
    categoria: string | null; codigo_barras: string | null; stock_minimo: number
    foto_path: string | null; foto_signed_url: string | null
  }
  const fotoPaths: string[] = []
  if (fotoUrlActiva) {
    for (const p of rows) if (p.foto_url) fotoPaths.push(p.foto_url as string)
  }

  const signedUrlByPath = new Map<string, string>()
  if (fotoPaths.length > 0) {
    const { data: signedList } = await admin.storage
      .from('productos')
      .createSignedUrls(fotoPaths, 60 * 60 * 8)
    for (const s of signedList ?? []) {
      if (s.signedUrl && s.path) signedUrlByPath.set(s.path, s.signedUrl)
    }
  }

  const productos: ProductoConFoto[] = rows.map((r) => ({
    id: r.id as string,
    nombre: r.nombre as string,
    precio_mxn: Number(r.precio_mxn ?? 0),
    stock: Number(r.stock ?? 0),
    unidad_stock: (r.unidad_stock as string) ?? 'unidad',
    categoria: (r.categoria as string | null) ?? null,
    codigo_barras: (r.codigo_barras as string | null) ?? null,
    stock_minimo: Number(r.stock_minimo ?? 3),
    foto_path: (r.foto_url as string | null) ?? null,
    foto_signed_url: r.foto_url ? signedUrlByPath.get(r.foto_url as string) ?? null : null,
  }))

  // KPIs
  const totalProductos = productos.length
  const valorInventarioMxn = productos.reduce((s, p) => s + p.precio_mxn * p.stock, 0)
  const valorInventarioUsd = valorInventarioMxn / rate
  const enBajoStock = productos.filter(p => p.stock <= p.stock_minimo && p.stock > 0).length
  const enCero = productos.filter(p => p.stock === 0).length
  const categorias = Array.from(new Set(productos.map(p => p.categoria).filter(Boolean) as string[])).sort()

  const vista: 'grid' | 'lista' = sp.vista === 'lista' ? 'lista' : 'grid'

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-6xl mx-auto">
      {/* Header con KPIs */}
      <header className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
              <Package className="h-6 w-6 text-emerald-400" />
              Inventario
            </h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Cvu Pharmacy local · TC ${rate.toFixed(2)} MXN/USD
            </p>
          </div>
        </div>

        {/* KPIs en glassmorphism cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <KpiCard
            label="Productos"
            value={totalProductos.toString()}
            sub={`${productos.reduce((s, p) => s + p.stock, 0)} unidades`}
            tone="emerald"
          />
          <KpiCard
            label="Valor total"
            value={formatMoney(valorInventarioMxn, 'MXN')}
            sub={`≈ ${formatMoney(valorInventarioUsd, 'USD')}`}
            tone="cyan"
          />
          <KpiCard
            label="Bajo stock"
            value={enBajoStock.toString()}
            sub={`≤ ${productos[0]?.stock_minimo ?? 3} unidades`}
            tone="amber"
            icon={<AlertTriangle className="h-3 w-3" />}
          />
          <KpiCard
            label="Agotados"
            value={enCero.toString()}
            sub="Sin stock"
            tone="rose"
            icon={<DollarSign className="h-3 w-3" />}
          />
        </div>
      </header>

      {!fotoUrlActiva && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200 flex items-start gap-2">
          <Sparkles className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            La columna <code className="font-mono">foto_url</code> aún no existe en BD. Para activar fotos
            de productos, corre la <strong>migración 0040</strong> en Supabase SQL Editor. La app funciona
            sin ella; cuando la corras, recarga.
          </span>
        </div>
      )}

      <InventarioGalleryClient
        productos={productos}
        categorias={categorias}
        rate={rate}
        fotoUrlActiva={fotoUrlActiva}
        filtroInicial={{
          categoria: sp.categoria ?? '',
          q: sp.q ?? '',
          bajoStock: sp.bajo_stock === '1',
          vista,
        }}
      />
    </div>
  )
}

function KpiCard({
  label, value, sub, tone, icon,
}: {
  label: string; value: string; sub?: string
  tone: 'emerald' | 'cyan' | 'amber' | 'rose'
  icon?: React.ReactNode
}) {
  const tones = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200',
    cyan:    'border-cyan-500/20    bg-cyan-500/5    text-cyan-200',
    amber:   'border-amber-500/30   bg-amber-500/5   text-amber-200',
    rose:    'border-rose-500/30    bg-rose-500/5    text-rose-200',
  }
  const valueTones = {
    emerald: 'text-emerald-300',
    cyan:    'text-cyan-300',
    amber:   'text-amber-300',
    rose:    'text-rose-300',
  }
  return (
    <div className={`rounded-xl border p-3 backdrop-blur-sm ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-wider font-bold inline-flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className={`text-xl font-black tabular-nums leading-tight ${valueTones[tone]}`}>
        {value}
      </p>
      {sub && <p className="text-[9px] text-zinc-500">{sub}</p>}
    </div>
  )
}
