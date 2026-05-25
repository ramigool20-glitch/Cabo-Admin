import Link from 'next/link'
import { Users, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Fab } from '@/components/ui/fab'

export default async function NominaPage() {
  const supabase = await createClient()
  const { data: empleados } = await supabase
    .from('empleados')
    .select('id, nombre, puesto, fecha_ingreso, empleado_compensacion(id, sueldo_base, comision_porcentaje, frecuencia_pago, activo)')
    .eq('activo', true)
    .order('nombre')

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Nómina</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {empleados?.length ?? 0} {(empleados?.length ?? 0) === 1 ? 'empleado' : 'empleados'} activos.
        </p>
      </header>

      {empleados && empleados.length > 0 ? (
        <ul className="rounded-2xl border bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
          {empleados.map((e) => {
            const comps = (e.empleado_compensacion as Array<{ activo: boolean }> | null) ?? []
            const nActivas = comps.filter((c) => c.activo).length
            return (
              <li key={e.id}>
                <Link href={`/nomina/${e.id}`} className="flex items-center gap-3 p-4">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0 leading-tight">
                    <p className="font-medium truncate">{e.nombre}</p>
                    <p className="text-xs text-zinc-500 truncate">
                      {e.puesto || 'Sin puesto'} · {nActivas} {nActivas === 1 ? 'compensación' : 'compensaciones'}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-300" />
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-10 text-center text-sm text-zinc-500">
          Sin empleados aún. Toca <strong>+</strong> para agregar el primero.
        </div>
      )}

      <Fab href="/nomina/nuevo" label="Nuevo empleado" />
    </div>
  )
}
