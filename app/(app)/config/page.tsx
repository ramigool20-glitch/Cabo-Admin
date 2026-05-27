import { Bell, Users, Building2, Send, History, Stethoscope, Wand2 } from 'lucide-react'
import Link from 'next/link'
import { PushSection } from '@/components/config/push-section'
import { NotificacionesPanel } from '@/components/config/notificaciones-panel'
import { HistorialNotificaciones } from '@/components/config/historial-notificaciones'
import { DiagnosticoPush } from '@/components/config/diagnostico-push'
import { BackfillFxButton } from '@/components/config/backfill-fx-button'

export default function ConfigPage() {
  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient">Configuración</h1>
        <p className="text-sm text-zinc-400">
          Notificaciones, negocios, cuentas y participaciones.
        </p>
      </header>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Bell className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">Notificaciones push</h2>
        </div>
        <PushSection />
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Stethoscope className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">Diagnóstico push</h2>
        </div>
        <DiagnosticoPush />
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Send className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">Disparar manualmente</h2>
        </div>
        <NotificacionesPanel />
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <History className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">Historial reciente</h2>
        </div>
        <HistorialNotificaciones />
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Wand2 className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">Mantenimiento</h2>
        </div>
        <BackfillFxButton />
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Building2 className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">Otros ajustes</h2>
        </div>
        <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
          <li>
            <Link href="/negocios" className="flex items-center gap-3 p-4 hover:bg-[var(--bg-card-hover)] transition-colors">
              <Building2 className="h-5 w-5 text-emerald-400" />
              <span className="flex-1 text-sm">Negocios y cuentas</span>
              <span className="text-xs text-zinc-500">Ver</span>
            </Link>
          </li>
          <li>
            <Link href="/nomina" className="flex items-center gap-3 p-4 hover:bg-[var(--bg-card-hover)] transition-colors">
              <Users className="h-5 w-5 text-indigo-400" />
              <span className="flex-1 text-sm">Empleados</span>
              <span className="text-xs text-zinc-500">Ver</span>
            </Link>
          </li>
        </ul>
      </section>
    </div>
  )
}
