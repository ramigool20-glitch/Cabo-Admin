import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CuentaCobrarForm } from '@/components/por-cobrar/cuenta-form'

export default async function NuevaCuentaPorCobrarPage() {
  const supabase = await createClient()
  const { data: negocios } = await supabase
    .from('negocios')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 max-w-2xl mx-auto">
      <Link href="/por-cobrar" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Por Cobrar
      </Link>
      <header><h1 className="text-2xl font-black heading-gradient">Nueva cuenta por cobrar</h1></header>
      <CuentaCobrarForm negocios={negocios ?? []} />
    </div>
  )
}
