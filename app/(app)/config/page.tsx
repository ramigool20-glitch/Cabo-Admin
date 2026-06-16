import { Bell, Users, Building2, History, Wand2, Plug, Activity } from 'lucide-react'
import Link from 'next/link'
import { PushSection } from '@/components/config/push-section'
import { HistorialNotificaciones } from '@/components/config/historial-notificaciones'
import { DiagnosticoPush } from '@/components/config/diagnostico-push'
import { BackfillFxButton } from '@/components/config/backfill-fx-button'
import { IntegracionesPanel } from '@/components/config/integraciones-panel'
import { WebhookLogCard, type WebhookLogRow } from '@/components/config/webhook-log-card'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function ConfigPage() {
  const admin = createAdminClient()
  const [{ data: cuentas }, { data: negocios }, { data: socios }, intgRes, numRes, logRes] = await Promise.all([
    admin.from('cuentas').select('id, nombre').eq('activo', true).order('nombre'),
    admin.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
    admin.from('profiles').select('id, nombre').eq('activo', true).order('nombre'),
    admin.from('integraciones_mp').select('id, nombre, activa, cobros_count, ultimo_sync, saldo_disponible, saldo_pendiente, saldo_total, saldo_moneda, saldo_actualizado_at, saldo_error').order('created_at', { ascending: false }),
    admin.from('whatsapp_autorizados').select('id, numero, nombre, activo').order('created_at', { ascending: false }),
    admin.from('webhook_log').select('id, fuente, ok, payment_id, payment_type, error, duracion_ms, resultado, created_at').order('created_at', { ascending: false }).limit(20),
  ])
  const webhookLogRows: WebhookLogRow[] = (logRes?.data ?? []) as WebhookLogRow[]
  const prodUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cabo-admin.vercel.app'

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
          <h2 className="text-sm font-semibold text-white">Notificaciones</h2>
        </div>
        <PushSection />
        <DiagnosticoPush />
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Plug className="h-4 w-4 text-sky-400" />
          <h2 className="text-sm font-semibold text-white">Integraciones automáticas</h2>
        </div>
        <IntegracionesPanel
          cuentas={cuentas ?? []}
          negocios={negocios ?? []}
          socios={socios ?? []}
          integraciones={intgRes.data ?? []}
          numeros={numRes.data ?? []}
          prodUrl={prodUrl}
        />
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Activity className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">Diagnóstico de integraciones</h2>
        </div>
        <WebhookLogCard rows={webhookLogRows} />
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <History className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">Historial de notificaciones</h2>
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
