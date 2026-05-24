import { createAdminClient } from '@/lib/supabase/admin'

// Página de validación de Fase 0.
// En Fase 1 se reemplaza por la pantalla principal y se usa el cliente
// con la sesión del usuario en vez del admin client.
export default async function Home() {
  const supabase = createAdminClient()

  const [{ data: negocios, error: nErr }, { data: cuentas, error: cErr }] = await Promise.all([
    supabase.from('negocios').select('id, nombre, tipo, moneda_principal').order('nombre'),
    supabase.from('cuentas').select('id, nombre, moneda, tipo').order('nombre'),
  ])

  return (
    <main className="min-h-screen p-6 bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Control Negocios</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Miguel &amp; Sergio — Multi-negocio en Los Cabos
          </p>
        </header>

        <section className="rounded-xl border bg-white dark:bg-zinc-900 p-5 space-y-3">
          <h2 className="font-semibold">✅ Fase 0: Setup completo</h2>
          {nErr || cErr ? (
            <p className="text-red-600 text-sm">
              Error: {nErr?.message || cErr?.message}
            </p>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Supabase conectado · {negocios?.length ?? 0} negocios ·{' '}
              {cuentas?.length ?? 0} cuentas · RLS activo
            </p>
          )}
        </section>

        {negocios && negocios.length > 0 && (
          <section className="rounded-xl border bg-white dark:bg-zinc-900 p-5">
            <h2 className="font-semibold mb-3">Negocios</h2>
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {negocios.map((n) => (
                <li key={n.id} className="flex justify-between py-2 text-sm">
                  <span>{n.nombre}</span>
                  <span className="text-zinc-500">
                    {n.tipo} · {n.moneda_principal}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {cuentas && cuentas.length > 0 && (
          <section className="rounded-xl border bg-white dark:bg-zinc-900 p-5">
            <h2 className="font-semibold mb-3">Cuentas</h2>
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {cuentas.map((c) => (
                <li key={c.id} className="flex justify-between py-2 text-sm">
                  <span>{c.nombre}</span>
                  <span className="text-zinc-500">
                    {c.tipo} · {c.moneda}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-xs text-zinc-500 text-center">
          Próximo: Fase 1 (Auth + PWA + esqueleto)
        </p>
      </div>
    </main>
  )
}
