'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Filter, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO } from '@/lib/categorias'

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
  const categoria = sp.get('categoria')
  const hasFilters = !!(tipo || negocioId || cuentaId || categoria)

  const updateParam = (key: string, val: string | null) => {
    const params = new URLSearchParams(sp.toString())
    if (val) params.set(key, val)
    else params.delete(key)
    router.push(`/transacciones${params.toString() ? '?' + params.toString() : ''}`)
  }

  const clearAll = () => {
    const params = new URLSearchParams(sp.toString())
    params.delete('tipo')
    params.delete('negocio')
    params.delete('cuenta')
    params.delete('categoria')
    router.push(`/transacciones${params.toString() ? '?' + params.toString() : ''}`)
  }

  // Categorías para mostrar: si filtran por tipo, mostramos solo las que aplican
  const categoriasDisponibles =
    tipo === 'ingreso'
      ? [...CATEGORIAS_INGRESO]
      : tipo === 'gasto'
        ? [...CATEGORIAS_GASTO]
        : [...new Set([...CATEGORIAS_GASTO, ...CATEGORIAS_INGRESO])]

  const totalFiltros = [tipo, negocioId, cuentaId, categoria].filter(Boolean).length

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-medium border transition-colors',
            hasFilters
              ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-zinc-400'
          )}
        >
          <Filter className="h-4 w-4" />
          Filtros {hasFilters && `· ${totalFiltros}`}
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-rose-400"
          >
            <X className="h-3.5 w-3.5" />
            Limpiar
          </button>
        )}
      </div>

      {open && (
        <div className="card p-3 space-y-3">
          {/* Tipo */}
          <div>
            <p className="label-caps mb-1.5">Tipo</p>
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
                      ? 'border-cyan-500 bg-cyan-500 text-white'
                      : 'border-[var(--border-subtle)] text-zinc-400'
                  )}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          {/* Negocio */}
          <div>
            <p className="label-caps mb-1.5">Negocio</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => updateParam('negocio', null)}
                className={cn(
                  'h-8 px-3 rounded-full text-xs border',
                  !negocioId
                    ? 'border-cyan-500 bg-cyan-500 text-white'
                    : 'border-[var(--border-subtle)] text-zinc-400'
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
                      ? 'border-cyan-500 bg-cyan-500 text-white'
                      : 'border-[var(--border-subtle)] text-zinc-400'
                  )}
                >
                  {n.nombre}
                </button>
              ))}
            </div>
          </div>

          {/* Cuenta */}
          <div>
            <p className="label-caps mb-1.5">Cuenta</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => updateParam('cuenta', null)}
                className={cn(
                  'h-8 px-3 rounded-full text-xs border',
                  !cuentaId
                    ? 'border-cyan-500 bg-cyan-500 text-white'
                    : 'border-[var(--border-subtle)] text-zinc-400'
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
                      ? 'border-cyan-500 bg-cyan-500 text-white'
                      : 'border-[var(--border-subtle)] text-zinc-400'
                  )}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>

          {/* Categoría */}
          <div>
            <p className="label-caps mb-1.5">Categoría</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => updateParam('categoria', null)}
                className={cn(
                  'h-8 px-3 rounded-full text-xs border',
                  !categoria
                    ? 'border-cyan-500 bg-cyan-500 text-white'
                    : 'border-[var(--border-subtle)] text-zinc-400'
                )}
              >
                Todas
              </button>
              {categoriasDisponibles.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => updateParam('categoria', c)}
                  className={cn(
                    'h-8 px-3 rounded-full text-xs border capitalize',
                    categoria === c
                      ? 'border-cyan-500 bg-cyan-500 text-white'
                      : 'border-[var(--border-subtle)] text-zinc-400'
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
