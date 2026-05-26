import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CuentaForm } from '@/components/por-pagar/cuenta-form'

export default async function NuevaCuentaPorPagarPage() {
  const supabase = await createClient()
  const { data: negocios } = await supabase
    .from('negocios')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 max-w-2xl mx-auto">
      <Link href="/por-pagar" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Por Pagar
      </Link>
      <header><h1 className="text-2xl font-black heading-gradient">Nueva cuenta por pagar</h1></header>
      <CuentaForm negocios={negocios ?? []} />
    </div>
  )
}
