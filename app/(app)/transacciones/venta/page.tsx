import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { VentaProductosClient } from '@/components/ventas/venta-productos-client'

export const dynamic = 'force-dynamic'

export default async function NuevaVentaPage() {
  const admin = createAdminClient()

  // Negocios elegibles (sin Rancho McCoy — eventos)
  const { data: negocios } = await admin
    .from('negocios')
    .select('id, nombre, tipo')
    .eq('activo', true)
    .neq('nombre', 'Rancho McCoy')
    .order('nombre')

  // Cuentas para asignar el ingreso
  const { data: cuentas } = await admin
    .from('cuentas')
    .select('id, nombre, moneda, tipo')
    .eq('activa', true)
    .order('nombre')

  // Productos con costo (defensive si 0041 no se aplicó)
  type Producto = {
    id: string; nombre: string; precio_mxn: number; stock: number
    categoria: string | null; codigo_barras: string | null
    costo_mxn: number | null
  }
  let productos: Producto[] = []
  try {
    const { data } = await admin
      .from('inventario_productos')
      .select('id, nombre, precio_mxn, stock, categoria, codigo_barras, costo_mxn')
      .eq('activo', true)
      .order('nombre')
    productos = (data ?? []).map(p => ({
      id: p.id as string,
      nombre: p.nombre as string,
      precio_mxn: Number(p.precio_mxn ?? 0),
      stock: Number(p.stock ?? 0),
      categoria: (p.categoria as string | null) ?? null,
      codigo_barras: (p.codigo_barras as string | null) ?? null,
      costo_mxn: p.costo_mxn != null ? Number(p.costo_mxn) : null,
    }))
  } catch {
    productos = []
  }

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

      <VentaProductosClient
        negocios={(negocios ?? []) as never}
        cuentas={(cuentas ?? []) as never}
        productos={productos}
      />
    </div>
  )
}
