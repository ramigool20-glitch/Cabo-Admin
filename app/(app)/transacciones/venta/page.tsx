import Link from 'next/link'
import { ChevronLeft, AlertTriangle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { VentaProductosClient } from '@/components/ventas/venta-productos-client'

export const dynamic = 'force-dynamic'

export default async function NuevaVentaPage() {
  const admin = createAdminClient()

  // Negocios elegibles (todos menos Rancho McCoy — ese es eventos)
  const { data: negocios } = await admin
    .from('negocios')
    .select('id, nombre, tipo')
    .eq('activo', true)
    .neq('nombre', 'Rancho McCoy')
    .order('nombre')

  // ⚠ BUG CORREGIDO: la columna es 'activo' (no 'activa')
  // — antes traía 0 cuentas y el select aparecía vacío
  const { data: cuentas } = await admin
    .from('cuentas')
    .select('id, nombre, moneda, tipo')
    .eq('activo', true)
    .order('nombre')

  // Productos con costo (defensive si migración 0041 sin aplicar)
  type Producto = {
    id: string; nombre: string; precio_mxn: number; stock: number
    categoria: string | null; codigo_barras: string | null
    costo_mxn: number | null
  }
  let productos: Producto[] = []
  try {
    const { data, error } = await admin
      .from('inventario_productos')
      .select('id, nombre, precio_mxn, stock, categoria, codigo_barras, costo_mxn')
      .eq('activo', true)
      .order('nombre')
    if (error) {
      // Quizá costo_mxn no existe → retry sin
      const { data: data2 } = await admin
        .from('inventario_productos')
        .select('id, nombre, precio_mxn, stock, categoria, codigo_barras')
        .eq('activo', true)
        .order('nombre')
      productos = (data2 ?? []).map(p => ({
        id: p.id as string,
        nombre: p.nombre as string,
        precio_mxn: Number(p.precio_mxn ?? 0),
        stock: Number(p.stock ?? 0),
        categoria: (p.categoria as string | null) ?? null,
        codigo_barras: (p.codigo_barras as string | null) ?? null,
        costo_mxn: null,
      }))
    } else {
      productos = (data ?? []).map(p => ({
        id: p.id as string,
        nombre: p.nombre as string,
        precio_mxn: Number(p.precio_mxn ?? 0),
        stock: Number(p.stock ?? 0),
        categoria: (p.categoria as string | null) ?? null,
        codigo_barras: (p.codigo_barras as string | null) ?? null,
        costo_mxn: p.costo_mxn != null ? Number(p.costo_mxn) : null,
      }))
    }
  } catch {
    productos = []
  }

  // Pre-requisitos: si no hay negocios o cuentas, no se puede usar el form
  const negociosOk = (negocios?.length ?? 0) > 0
  const cuentasOk = (cuentas?.length ?? 0) > 0
  const productosOk = productos.length > 0
  const todoOk = negociosOk && cuentasOk && productosOk

  return (
    <div className="px-4 pt-4 pb-32 space-y-4 max-w-3xl mx-auto">
      <Link href="/transacciones" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" />
        Transacciones
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient">Registrar venta</h1>
        <p className="text-[11px] text-zinc-500">
          Productos del inventario. Descuenta stock y calcula ganancia automáticamente.
        </p>
      </header>

      {!todoOk && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-300" />
            <p className="text-sm font-bold text-rose-200">Faltan prerequisitos</p>
          </div>
          <ul className="text-xs text-rose-200/80 space-y-1 list-disc pl-6">
            {!negociosOk && <li>No hay negocios activos en BD. Crea uno en <Link href="/negocios" className="underline">/negocios</Link>.</li>}
            {!cuentasOk && <li>No hay cuentas activas. Crea una para asignar los ingresos.</li>}
            {!productosOk && <li>No hay productos en inventario. Agrega productos en <Link href="/inventario/nuevo" className="underline">/inventario/nuevo</Link>.</li>}
          </ul>
        </div>
      )}

      {todoOk && (
        <VentaProductosClient
          negocios={negocios ?? []}
          cuentas={cuentas ?? []}
          productos={productos}
        />
      )}
    </div>
  )
}
