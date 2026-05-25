import Link from 'next/link'
import { Building2, ChevronRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'

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

      <ul className="rounded-2xl border bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
        {negocios?.map((n) => (
          <li key={n.id}>
            <Link
              href={`/negocios/${n.id}`}
              className="flex items-center gap-3 p-4 active:bg-zinc-50 dark:active:bg-zinc-800/50"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0 leading-tight">
                <p className="font-medium truncate">{n.nombre}</p>
                <p className="text-xs text-zinc-500 capitalize">
                  {n.tipo.replace('_', ' ')}
                </p>
              </div>
              <span className="text-[10px] font-semibold text-zinc-500 px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800">
                {n.moneda_principal}
              </span>
              <ChevronRight className="h-4 w-4 text-zinc-300 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
