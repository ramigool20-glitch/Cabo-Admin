import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { PosClient } from '@/components/pos/pos-client'

export const dynamic = 'force-dynamic'

export default async function PosPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  // Usuario actual (para mostrar nombre + saber si es cajera)
  const { data: { user } } = await supabase.auth.getUser()
  let userNombre = 'Usuario'
  let rol: string | null = null
  if (user) {
    const { data: prof } = await admin
      .from('profiles')
      .select('nombre, roles(nombre)')
      .eq('id', user.id)
      .single()
    userNombre = (prof?.nombre as string) ?? user.email?.split('@')[0] ?? 'Usuario'
    rol = ((prof?.roles as unknown as { nombre: string } | null)?.nombre) ?? null
  }

  // Hardcoded a Cvu Pharmacy local — el POS es solo para ese negocio
  const { data: negocio } = await admin
    .from('negocios')
    .select('id, nombre, tipo')
    .ilike('nombre', '%cvu pharmacy local%')
    .eq('activo', true)
    .maybeSingle()

  // Cuentas activas en MXN para asignar el ingreso
  const { data: cuentas } = await admin
    .from('cuentas')
    .select('id, nombre, moneda, tipo')
    .eq('activo', true)
    .eq('moneda', 'MXN')
    .order('nombre')

  // Productos del inventario (defensive con migración 0041)
  type Producto = {
    id: string; nombre: string; precio_mxn: number; stock: number
    categoria: string | null; codigo_barras: string | null
    costo_mxn: number | null
    foto_path: string | null; foto_signed_url: string | null
  }
  let productos: Producto[] = []
  let rate = 17
  try {
    const { data, error } = await admin
      .from('inventario_productos')
      .select('id, nombre, precio_mxn, stock, categoria, codigo_barras, costo_mxn, foto_url')
      .eq('activo', true)
      .order('nombre')

    let rows: Array<Record<string, unknown>>
    if (error) {
      const { data: data2 } = await admin
        .from('inventario_productos')
        .select('id, nombre, precio_mxn, stock, categoria, codigo_barras, foto_url')
        .eq('activo', true)
        .order('nombre')
      rows = (data2 ?? []) as Array<Record<string, unknown>>
    } else {
      rows = (data ?? []) as Array<Record<string, unknown>>
    }

    // Signed URLs para fotos
    const fotoPaths = rows.map(r => r.foto_url).filter(Boolean) as string[]
    const signedByPath = new Map<string, string>()
    if (fotoPaths.length > 0) {
      const { data: signedList } = await admin.storage
        .from('productos')
        .createSignedUrls(fotoPaths, 60 * 60 * 8)
      for (const s of signedList ?? []) {
        if (s.signedUrl && s.path) signedByPath.set(s.path, s.signedUrl)
      }
    }

    productos = rows.map(r => ({
      id: r.id as string,
      nombre: r.nombre as string,
      precio_mxn: Number(r.precio_mxn ?? 0),
      stock: Number(r.stock ?? 0),
      categoria: (r.categoria as string | null) ?? null,
      codigo_barras: (r.codigo_barras as string | null) ?? null,
      costo_mxn: r.costo_mxn != null ? Number(r.costo_mxn) : null,
      foto_path: (r.foto_url as string | null) ?? null,
      foto_signed_url: r.foto_url ? signedByPath.get(r.foto_url as string) ?? null : null,
    }))
  } catch {
    productos = []
  }

  // FX rate
  try {
    const { data: fx } = await admin
      .from('fx_rates')
      .select('rate_compra')
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (fx) rate = Number(fx.rate_compra)
  } catch { /* fallback 17 */ }

  // Categorías para filtros
  const categorias = Array.from(new Set(productos.map(p => p.categoria).filter(Boolean) as string[])).sort()

  // Productos más vendidos HOY del negocio (quick reorder)
  let favoritosIds: string[] = []
  try {
    const hoyStr = new Date().toISOString().slice(0, 10)
    if (negocio) {
      const { data: txsHoy } = await admin
        .from('transacciones')
        .select('id')
        .eq('tiene_items', true)
        .eq('tipo', 'ingreso')
        .eq('negocio_id', negocio.id)
        .gte('fecha', hoyStr)
      const ids = (txsHoy ?? []).map(t => t.id)
      if (ids.length > 0) {
        const { data: items } = await admin
          .from('venta_items')
          .select('producto_id, cantidad')
          .in('transaccion_id', ids)
          .not('producto_id', 'is', null)
        const agg = new Map<string, number>()
        for (const it of items ?? []) {
          const k = String(it.producto_id)
          agg.set(k, (agg.get(k) ?? 0) + Number(it.cantidad ?? 0))
        }
        favoritosIds = Array.from(agg.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([id]) => id)
      }
    }
  } catch { /* sin favoritos */ }

  return (
    <PosClient
      negocio={negocio ?? null}
      cuentas={cuentas ?? []}
      productos={productos}
      categorias={categorias}
      rate={rate}
      userNombre={userNombre}
      esCajera={rol === 'cajera'}
      favoritosIds={favoritosIds}
    />
  )
}
