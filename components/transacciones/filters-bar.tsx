'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Filter, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Opt = { id: string; nombre: string }

export function FiltersBar({
  negocios,
  cuentas,
}: {
  negocios: Opt[]
  cuentas: Opt[]
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [open, setOpen] = useState(false)

  const tipo = sp.get('tipo')
  const negocioId = sp.get('negocio')
  const cuentaId = sp.get('cuenta')
  const hasFilters = !!(tipo || negocioId || cuentaId)

  const updateParam = (key: string, val: string | null) => {
    const params = new URLSearchParams(sp.toString())
    if (val) params.set(key, val)
    else params.delete(key)
    router.push(`/transacciones${params.toString() ? '?' + params.toString() : ''}`)
  }

  const clearAll = () => router.push('/transacciones')

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-medium border transition-colors',
            hasFilters
              ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
              : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
          )}
        >
          <Filter className="h-4 w-4" />
          Filtros {hasFilters && `· ${[tipo, negocioId, cuentaId].filter(Boolean).length}`}
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-600"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-xl border bg-white dark:bg-zinc-900 p-3 space-y-3">
          <div>
            <p className="text-xs font-medium text-zinc-500 mb-1.5">Tipo</p>
            <div className="flex gap-1.5">
              {[
                { v: null, l: 'Todos' },
                { v: 'gasto', l: 'Gastos' },
                { v: 'ingreso', l: 'Ingresos' },
              ].map((opt) => (
                <button
                  key={opt.l}
                  type="button"
                  onClick={() => updateParam('tipo', opt.v)}
                  className={cn(
                    'h-8 px-3 rounded-full text-xs border',
                    (tipo ?? null) === opt.v
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-600'
                  )}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-500 mb-1.5">Negocio</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => updateParam('negocio', null)}
                className={cn(
                  'h-8 px-3 rounded-full text-xs border',
                  !negocioId
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-700'
                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-600'
                )}
              >
                Todos
              </button>
              {negocios.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => updateParam('negocio', n.id)}
                  className={cn(
                    'h-8 px-3 rounded-full text-xs border',
                    negocioId === n.id
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-700'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-600'
                  )}
                >
                  {n.nombre}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-500 mb-1.5">Cuenta</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => updateParam('cuenta', null)}
                className={cn(
                  'h-8 px-3 rounded-full text-xs border',
                  !cuentaId
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-700'
                    : 'border-zinc-300 dark:border-zinc-700 text-zinc-600'
                )}
              >
                Todas
              </button>
              {cuentas.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => updateParam('cuenta', c.id)}
                  className={cn(
                    'h-8 px-3 rounded-full text-xs border',
                    cuentaId === c.id
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-700'
                      : 'border-zinc-300 dark:border-zinc-700 text-zinc-600'
                  )}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
