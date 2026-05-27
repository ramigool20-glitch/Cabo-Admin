import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { EventoForm } from '@/components/eventos/evento-form'

export default async function NuevoEventoPage(
  { searchParams }: { searchParams: Promise<{ fecha?: string }> }
) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: negocios } = await supabase
    .from('negocios')
    .select('id, nombre')
    .eq('activo', true)
    .order('nombre')

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 max-w-2xl mx-auto">
      <Link href="/eventos" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Eventos
      </Link>
      <header><h1 className="text-2xl font-black heading-gradient">Nuevo evento</h1></header>
      <EventoForm negocios={negocios ?? []} fechaInicial={sp.fecha} />
    </div>
  )
}
