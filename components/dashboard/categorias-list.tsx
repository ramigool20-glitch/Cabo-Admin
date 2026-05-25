import { formatMoney } from '@/lib/utils'

export type CategoriaItem = { categoria: string; monto: number; pct: number }

export function CategoriasList({ data }: { data: CategoriaItem[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 text-center text-sm text-zinc-500">
        Aún no hay gastos categorizados.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Top categorías de gasto
      </p>
      <ul className="space-y-2.5">
        {data.map((c) => (
          <li key={c.categoria}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="capitalize font-medium">{c.categoria}</span>
              <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                {formatMoney(c.monto, 'MXN')}
                <span className="text-xs text-zinc-400 ml-2">{c.pct.toFixed(0)}%</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-red-500/80"
                style={{ width: `${Math.min(c.pct, 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
