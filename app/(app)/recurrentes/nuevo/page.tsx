import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RecurrenteForm } from '@/components/recurrentes/recurrente-form'

export default async function NuevoRecurrentePage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const [{ data: negocios }, { data: cuentas }, { data: perfiles }] = await Promise.all([
    supabase.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('cuentas').select('id, nombre, moneda').eq('activo', true).order('nombre'),
    admin.from('profiles').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <Link href="/recurrentes" className="inline-flex items-center gap-1 text-sm text-zinc-600">
        <ChevronLeft className="h-4 w-4" /> Recurrentes
      </Link>
      <header><h1 className="text-2xl font-bold tracking-tight">Nuevo recurrente</h1></header>
      <RecurrenteForm
        negocios={negocios ?? []}
        cuentas={cuentas ?? []}
        perfiles={perfiles ?? []}
        defaults={{}}
      />
    </div>
  )
}
