import { Bell, Users, Building2 } from 'lucide-react'
import Link from 'next/link'
import { PushSection } from '@/components/config/push-section'

export default function ConfigPage() {
  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Configuración</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Notificaciones, negocios, cuentas y participaciones.
        </p>
      </header>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Bell className="h-4 w-4 text-zinc-500" />
          <h2 className="text-sm font-semibold">Notificaciones</h2>
        </div>
        <PushSection />
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Building2 className="h-4 w-4 text-zinc-500" />
          <h2 className="text-sm font-semibold">Otros ajustes</h2>
        </div>
        <ul className="rounded-2xl border bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
          <li>
            <Link href="/negocios" className="flex items-center gap-3 p-4 active:bg-zinc-50">
              <Building2 className="h-5 w-5 text-emerald-600" />
              <span className="flex-1 text-sm">Negocios y cuentas</span>
              <span className="text-xs text-zinc-400">Ver</span>
            </Link>
          </li>
          <li>
            <Link href="/nomina" className="flex items-center gap-3 p-4 active:bg-zinc-50">
              <Users className="h-5 w-5 text-indigo-600" />
              <span className="flex-1 text-sm">Empleados</span>
              <span className="text-xs text-zinc-400">Ver</span>
            </Link>
          </li>
        </ul>
      </section>

      <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5 text-center">
        <p className="text-xs text-zinc-500">
          Próximos ajustes: % de participación por socio, edición de cuentas, gestión de usuarios.
        </p>
      </div>
    </div>
  )
}
