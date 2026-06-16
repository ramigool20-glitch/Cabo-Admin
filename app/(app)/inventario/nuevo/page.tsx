import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { NuevoProductoClient } from '@/components/inventario/nuevo-producto-client'

export const dynamic = 'force-dynamic'

export default async function NuevoProductoPage() {
  const admin = createAdminClient()

  // Categorías ya existentes para sugerir en el dropdown
  const { data: cats } = await admin
    .from('inventario_productos')
    .select('categoria')
    .eq('activo', true)
  const categorias = Array.from(
    new Set((cats ?? []).map(c => c.categoria).filter(Boolean) as string[])
  ).sort()

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-2xl mx-auto">
      <Link href="/inventario" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" />
        Inventario
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient">Nuevo producto</h1>
        <p className="text-xs text-zinc-500">
          Escanea el código de barras con la cámara o ingrésalo manual.
        </p>
      </header>

      <NuevoProductoClient categorias={categorias} />
    </div>
  )
}
