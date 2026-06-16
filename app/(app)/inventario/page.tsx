/**
 * Inventario premium POS-style. Grid de cards con foto, precio, stock pill.
 * Tap en una card → sheet de detalle con edición inline + foto opcional.
 */
import Link from 'next/link'
import { Package, AlertTriangle, DollarSign, Sparkles, Plus } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney } from '@/lib/utils'
import { InventarioGalleryClient } from '@/components/inventario/inventario-gallery-client'
import { PedidoSugeridoBtn } from '@/components/inventario/pedido-sugerido-btn'

export const dynamic = 'force-dynamic'

type SearchParams = { categoria?: string; q?: string; bajo_stock?: string; agotados?: string; vista?: string }

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

  // Defensive: si las migraciones 0040 (foto_url) o 0041 (campos Pulpos) aún
  // no se aplican, hacemos retry con menos columnas. La app sigue funcionando.
  const baseCols = 'id, nombre, precio_mxn, stock, unidad_stock, categoria, codigo_barras, stock_minimo, activo'
  const colsFoto = `${baseCols}, foto_url`
  const colsExt = `${colsFoto}, sku, marca, ubicacion, descripcion, costo_mxn, cobra_iva, requiere_receta, lote, fecha_caducidad, clave_sat, vende_pos`
  let rows: Array<Record<string, unknown>> = []
  let fotoUrlActiva = true
  let extendidoActivo = true
  const r1 = await admin
    .from('inventario_productos')
    .select(colsExt)
    .eq('activo', true)
    .order('nombre')
  if (r1.error) {
    extendidoActivo = false
    const r2 = await admin
      .from('inventario_productos')
      .select(colsFoto)
      .eq('activo', true)
      .order('nombre')
    if (r2.error && /foto_url/i.test(r2.error.message ?? '')) {
      fotoUrlActiva = false
      const r3 = await admin
        .from('inventario_productos')
        .select(baseCols)
        .eq('activo', true)
        .order('nombre')
      rows = (r3.data ?? []) as unknown as Array<Record<string, unknown>>
    } else {
      rows = (r2.data ?? []) as unknown as Array<Record<string, unknown>>
    }
  } else {
    rows = (r1.data ?? []) as unknown as Array<Record<string, unknown>>
  }

  // Generar signed URLs para fotos (8h) si está activa la columna
  type ProductoConFoto = {
    id: string; nombre: string; precio_mxn: number; stock: number; unidad_stock: string
    categoria: string | null; codigo_barras: string | null; stock_minimo: number
    foto_path: string | null; foto_signed_url: string | null
    sku: string | null; marca: string | null; ubicacion: string | null
    descripcion: string | null; costo_mxn: number | null; cobra_iva: boolean
    requiere_receta: boolean; lote: string | null; fecha_caducidad: string | null
    clave_sat: string | null; vende_pos: boolean
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
    sku: (r.sku as string | null) ?? null,
    marca: (r.marca as string | null) ?? null,
    ubicacion: (r.ubicacion as string | null) ?? null,
    descripcion: (r.descripcion as string | null) ?? null,
    costo_mxn: r.costo_mxn != null ? Number(r.costo_mxn) : null,
    cobra_iva: r.cobra_iva !== false,
    requiere_receta: r.requiere_receta === true,
    lote: (r.lote as string | null) ?? null,
    fecha_caducidad: (r.fecha_caducidad as string | null) ?? null,
    clave_sat: (r.clave_sat as string | null) ?? null,
    vende_pos: r.vende_pos !== false,
  }))

  // KPIs
  const totalProductos = productos.length
  const valorInventarioMxn = productos.reduce((s, p) => s + p.precio_mxn * p.stock, 0)
  const valorInventarioUsd = valorInventarioMxn / rate
  const enBajoStock = productos.filter(p => p.stock <= p.stock_minimo && p.stock > 0).length
  const enCero = productos.filter(p => p.stock === 0).length
  // Margen / ganancia esperada — solo cuenta productos con costo
  const productosConCosto = productos.filter(p => p.costo_mxn != null && p.costo_mxn > 0)
  const costoTotalInventario = productosConCosto.reduce((s, p) => s + (p.costo_mxn ?? 0) * p.stock, 0)
  const valorConCosto = productosConCosto.reduce((s, p) => s + p.precio_mxn * p.stock, 0)
  const gananciaEsperadaMxn = valorConCosto - costoTotalInventario
  const margenPromedio = valorConCosto > 0 ? (gananciaEsperadaMxn / valorConCosto) * 100 : 0
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
          <div className="flex items-center gap-2">
            <PedidoSugeridoBtn />
            <Link
              href="/inventario/nuevo"
              className="h-10 px-3 rounded-full bg-emerald-600 text-white text-sm font-bold inline-flex items-center gap-1.5 shadow-lg shadow-emerald-500/30 active:scale-95 transition-transform"
            >
              <Plus className="h-4 w-4" />
              Nuevo
            </Link>
          </div>
        </div>

        {/* KPIs en glassmorphism cards — los de Bajo stock y Agotados son links a filtros */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <KpiCard
            label="Productos"
            value={totalProductos.toString()}
            sub={`${productos.reduce((s, p) => s + p.stock, 0)} unidades`}
            tone="emerald"
          />
          <KpiCard
            label="Valor venta"
            value={formatMoney(valorInventarioMxn, 'MXN')}
            sub={`≈ ${formatMoney(valorInventarioUsd, 'USD')}`}
            tone="cyan"
          />
          <KpiCard
            label="Bajo stock"
            value={enBajoStock.toString()}
            sub="Tap para ver"
            tone="amber"
            icon={<AlertTriangle className="h-3 w-3" />}
            href="/inventario?bajo_stock=1"
          />
          <KpiCard
            label="Agotados"
            value={enCero.toString()}
            sub="Tap para ver"
            tone="rose"
            icon={<DollarSign className="h-3 w-3" />}
            href="/inventario?agotados=1"
          />
        </div>

        {/* KPIs de ganancia (solo si hay productos con costo) */}
        {productosConCosto.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <KpiCard
              label="Costo total"
              value={formatMoney(costoTotalInventario, 'MXN')}
              sub={`${productosConCosto.length} c/costo`}
              tone="cyan"
            />
            <KpiCard
              label="Ganancia esperada"
              value={formatMoney(gananciaEsperadaMxn, 'MXN')}
              sub="Si vendes todo"
              tone="emerald"
            />
            <KpiCard
              label="Margen promedio"
              value={`${margenPromedio.toFixed(1)}%`}
              sub="Ponderado por valor"
              tone="emerald"
            />
          </div>
        )}
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
        extendidoActivo={extendidoActivo}
        filtroInicial={{
          categoria: sp.categoria ?? '',
          q: sp.q ?? '',
          bajoStock: sp.bajo_stock === '1',
          agotados: sp.agotados === '1',
          vista,
        }}
      />
    </div>
  )
}

function KpiCard({
  label, value, sub, tone, icon, href,
}: {
  label: string; value: string; sub?: string
  tone: 'emerald' | 'cyan' | 'amber' | 'rose'
  icon?: React.ReactNode
  href?: string
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
  const className = `rounded-xl border p-3 backdrop-blur-sm ${tones[tone]} ${href ? 'active:scale-[0.97] hover:brightness-110 transition-all' : ''}`
  const content = (
    <>
      <p className="text-[10px] uppercase tracking-wider font-bold inline-flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className={`text-xl font-black tabular-nums leading-tight ${valueTones[tone]}`}>
        {value}
      </p>
      {sub && <p className="text-[9px] text-zinc-500">{sub}</p>}
    </>
  )
  if (href) return <Link href={href} className={`block ${className}`}>{content}</Link>
  return <div className={className}>{content}</div>
}
