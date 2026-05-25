import { createAdminClient } from '@/lib/supabase/admin'
import { Building2, Wallet, CheckSquare, AlertCircle } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = createAdminClient()

  const { count: nNegocios } = await supabase
    .from('negocios')
    .select('id', { count: 'exact', head: true })
    .eq('activo', true)

  const { count: nCuentas } = await supabase
    .from('cuentas')
    .select('id', { count: 'exact', head: true })
    .eq('activo', true)

  const { count: nTransacciones } = await supabase
    .from('transacciones')
    .select('id', { count: 'exact', head: true })

  const { count: nTareasPendientes } = await supabase
    .from('tareas')
    .select('id', { count: 'exact', head: true })
    .in('estado', ['pendiente', 'en_progreso'])

  const tiles = [
    { label: 'Negocios',           value: nNegocios ?? 0,        icon: Building2,   color: 'text-emerald-600' },
    { label: 'Cuentas',            value: nCuentas ?? 0,         icon: Wallet,      color: 'text-blue-600' },
    { label: 'Transacciones',      value: nTransacciones ?? 0,   icon: CheckSquare, color: 'text-purple-600' },
    { label: 'Tareas pendientes',  value: nTareasPendientes ?? 0,icon: AlertCircle, color: 'text-amber-600' },
  ]

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Resumen del estado actual.</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 space-y-2">
            <t.icon className={`h-5 w-5 ${t.color}`} />
            <div>
              <p className="text-2xl font-bold tabular-nums">{t.value}</p>
              <p className="text-xs text-zinc-500">{t.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          📊 Las gráficas de ingresos, gastos, ROAS y utilidad llegan en <strong>Fase 4</strong>.
        </p>
      </div>
    </div>
  )
}
