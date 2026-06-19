import Link from 'next/link'
import { ChevronLeft, Fingerprint } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { HuellasClient } from '@/components/checador/huellas-client'

export const dynamic = 'force-dynamic'

export default async function HuellasPage() {
  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Solo admin
  let esAdmin = false
  if (user) {
    const { data: prof } = await admin
      .from('profiles').select('roles(nombre)').eq('id', user.id).single()
    const rol = (prof?.roles as unknown as { nombre: string } | null)?.nombre
    esAdmin = rol === 'admin' || rol === 'socio'
  }

  if (!esAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-rose-300">Solo admin puede registrar huellas.</p>
      </div>
    )
  }

  // Empleados activos
  const { data: empleados } = await admin
    .from('profiles')
    .select('id, nombre, roles(nombre)')
    .eq('activo', true)
    .order('nombre')

  // Verificar si tabla existe
  let tablaExiste = true
  try {
    const p = await admin.from('huellas_dactilares').select('id').limit(1)
    if (p.error) tablaExiste = false
  } catch { tablaExiste = false }

  // Huellas registradas por empleado
  const huellasPorEmpleado = new Map<string, number>()
  if (tablaExiste) {
    const { data: huellas } = await admin
      .from('huellas_dactilares')
      .select('profile_id')
      .eq('activo', true)
    for (const h of huellas ?? []) {
      huellasPorEmpleado.set(h.profile_id as string, (huellasPorEmpleado.get(h.profile_id as string) ?? 0) + 1)
    }
  }

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-2xl mx-auto">
      <Link href="/checador" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Checador
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
          <Fingerprint className="h-6 w-6 text-emerald-400" />
          Huellas dactilares
        </h1>
        <p className="text-[11px] text-zinc-500">
          Registra la huella de cada empleado. Necesitas el lector USB conectado a esta compu.
        </p>
      </header>

      <HuellasClient
        empleados={(empleados ?? []).map(e => ({
          id: e.id as string,
          nombre: e.nombre as string,
          rol: ((e.roles as unknown as { nombre: string } | null)?.nombre) ?? 'sin rol',
          huellasCount: huellasPorEmpleado.get(e.id as string) ?? 0,
        }))}
        tablaExiste={tablaExiste}
      />
    </div>
  )
}
