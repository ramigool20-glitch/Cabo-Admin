import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TareaForm } from '@/components/tareas/tarea-form'

export default async function NuevaTareaPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  const [{ data: roles }, { data: allPerfiles }, { data: negocios }] = await Promise.all([
    admin.from('roles').select('id, nombre'),
    admin.from('profiles').select('id, nombre, role_id').eq('activo', true).order('nombre'),
    supabase.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  const rolesById = new Map((roles ?? []).map((r) => [r.id, r.nombre]))
  const me = (allPerfiles ?? []).find((p) => p.id === user?.id)
  const esEnfermera = rolesById.get(me?.role_id ?? '') === 'enfermera'

  // La enfermera solo puede enviar tareas a socios/admin (Sergio, Miguel)
  const perfiles = esEnfermera
    ? (allPerfiles ?? []).filter((p) => ['admin', 'socio'].includes(rolesById.get(p.role_id ?? '') ?? ''))
    : (allPerfiles ?? [])

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 max-w-2xl mx-auto">
      <Link href="/tareas" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Tareas
      </Link>
      <header><h1 className="text-2xl font-black heading-gradient">Nueva tarea</h1></header>
      <TareaForm perfiles={perfiles.map((p) => ({ id: p.id, nombre: p.nombre }))} negocios={negocios ?? []} esEnfermera={esEnfermera} />
    </div>
  )
}
