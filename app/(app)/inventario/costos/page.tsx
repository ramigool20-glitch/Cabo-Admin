import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { CostosClient } from '@/components/inventario/costos-client'

export const dynamic = 'force-dynamic'

export default async function CostosFaltantesPage() {
  const admin = createAdminClient()

  // Productos sin costo cargado
  let sinCosto: Array<{ id: string; nombre: string; precio_mxn: number; categoria: string | null; codigo_barras: string | null }> = []
  let total = 0
  try {
    const { data } = await admin
      .from('inventario_productos')
      .select('id, nombre, precio_mxn, categoria, codigo_barras, costo_mxn')
      .eq('activo', true)
      .order('precio_mxn', { ascending: false })
    const todos = (data ?? []) as Array<{ id: string; nombre: string; precio_mxn: number; categoria: string | null; codigo_barras: string | null; costo_mxn: number | null }>
    total = todos.length
    sinCosto = todos
      .filter(p => p.costo_mxn == null || Number(p.costo_mxn) <= 0)
      .map(p => ({
        id: p.id,
        nombre: p.nombre,
        precio_mxn: Number(p.precio_mxn),
        categoria: p.categoria,
        codigo_barras: p.codigo_barras,
      }))
  } catch { /* ignore */ }

  const conCosto = total - sinCosto.length

  return (
    <div className="px-4 pt-4 pb-32 space-y-4 max-w-4xl mx-auto">
      <Link href="/inventario" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Inventario
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
          🤖 Costos faltantes con IA
        </h1>
        <p className="text-[11px] text-zinc-500">
          {conCosto}/{total} productos con costo cargado · {sinCosto.length} faltan
        </p>
      </header>

      <CostosClient productos={sinCosto} />
    </div>
  )
}
