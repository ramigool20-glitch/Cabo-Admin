import { createAdminClient } from '@/lib/supabase/admin'
import { Building2 } from 'lucide-react'

export default async function NegociosPage() {
  const supabase = createAdminClient()
  const { data: negocios } = await supabase
    .from('negocios')
    .select('id, nombre, tipo, moneda_principal, activo')
    .order('tipo')
    .order('nombre')

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Negocios</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {negocios?.length ?? 0} centros de costo configurados.
        </p>
      </header>

      <ul className="space-y-2">
        {negocios?.map((n) => (
          <li
            key={n.id}
            className="flex items-center justify-between rounded-xl border bg-white dark:bg-zinc-900 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="leading-tight">
                <p className="font-medium">{n.nombre}</p>
                <p className="text-xs text-zinc-500 capitalize">
                  {n.tipo.replace('_', ' ')}
                </p>
              </div>
            </div>
            <span className="text-xs font-medium text-zinc-500 px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800">
              {n.moneda_principal}
            </span>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          🔍 La pantalla de detalle por negocio (ingresos, gastos, ROAS) llega en <strong>Fase 4</strong>.
        </p>
      </div>
    </div>
  )
}
