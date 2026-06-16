import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { NuevaCotizacionClient } from '@/components/cotizaciones/nueva-cotizacion-client'

export const dynamic = 'force-dynamic'

export default async function NuevaCotizacionPage() {
  const admin = createAdminClient()

  // Negocios elegibles (todos menos Rancho McCoy)
  const { data: negocios } = await admin
    .from('negocios')
    .select('id, nombre, tipo, slogan, rfc, telefono, email, color_primario, color_secundario')
    .eq('activo', true)
    .neq('nombre', 'Rancho McCoy')
    .order('nombre')

  // Productos del inventario (defensive con costos)
  let productos: Array<{ id: string; nombre: string; precio_mxn: number; categoria: string | null; codigo_barras: string | null; stock: number }> = []
  try {
    const { data } = await admin
      .from('inventario_productos')
      .select('id, nombre, precio_mxn, categoria, codigo_barras, stock')
      .eq('activo', true)
      .order('nombre')
    productos = (data ?? []).map((p) => ({
      id: p.id as string,
      nombre: p.nombre as string,
      precio_mxn: Number(p.precio_mxn ?? 0),
      categoria: (p.categoria as string | null) ?? null,
      codigo_barras: (p.codigo_barras as string | null) ?? null,
      stock: Number(p.stock ?? 0),
    }))
  } catch {
    productos = []
  }

  return (
    <div className="px-4 pt-4 pb-32 space-y-4 max-w-3xl mx-auto">
      <Link href="/cotizaciones" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" />
        Cotizaciones
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient">Nueva cotización</h1>
        <p className="text-[11px] text-zinc-500">
          Escoge el negocio, agrega productos y genera la imagen profesional.
        </p>
      </header>

      <NuevaCotizacionClient
        negocios={(negocios ?? []) as never}
        productos={productos}
      />
    </div>
  )
}
