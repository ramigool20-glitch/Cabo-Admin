import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TareaForm } from '@/components/tareas/tarea-form'

export default async function NuevaTareaPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const [{ data: perfiles }, { data: negocios }] = await Promise.all([
    admin.from('profiles').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 max-w-2xl mx-auto">
      <Link href="/tareas" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Tareas
      </Link>
      <header><h1 className="text-2xl font-black heading-gradient">Nueva tarea</h1></header>
      <TareaForm perfiles={perfiles ?? []} negocios={negocios ?? []} />
    </div>
  )
}
