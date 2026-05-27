'use client'

import { useState, useTransition } from 'react'
import { Plus, Check, Trash2, RotateCcw, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import { toast } from '@/components/ui/toast'
import { agregarShoppingItem, marcarComprado, reabrirItem, eliminarItem } from '@/app/(app)/casa/actions'

type Item = {
  id: string
  item: string
  cantidad: string | null
  prioridad: string
  agregado_por: string | null
  comprado: boolean
  comprado_at: string | null
  comprado_por: string | null
  notas: string | null
  created_at: string
}

export function ShoppingList({ items }: { items: Item[] }) {
  const [pending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [nuevoItem, setNuevoItem] = useState('')
  const [nuevoCant, setNuevoCant] = useState('')
  const [prioridad, setPrioridad] = useState<'alta' | 'normal' | 'baja'>('normal')

  const pendientes = items.filter((i) => !i.comprado)
  const comprados = items.filter((i) => i.comprado).slice(0, 5)

  const agregar = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevoItem.trim()) return
    const fd = new FormData()
    fd.append('item', nuevoItem)
    if (nuevoCant) fd.append('cantidad', nuevoCant)
    fd.append('prioridad', prioridad)
    startTransition(async () => {
      const res = await agregarShoppingItem(fd)
      if (res.ok) {
        setNuevoItem('')
        setNuevoCant('')
        setPrioridad('normal')
        toast.success('Agregado a la lista')
      } else {
        toast.error('No se pudo agregar', res.error)
      }
    })
  }

  const accion = async (fn: () => Promise<void>, id: string) => {
    setPendingId(id)
    startTransition(async () => {
      await fn()
      setPendingId(null)
    })
  }

  return (
    <div className="space-y-3">
      {/* Form agregar */}
      <form onSubmit={agregar} className="card p-3 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={nuevoItem}
            onChange={(e) => setNuevoItem(e.target.value)}
            placeholder="Papel, leche, jabón..."
            className="input-base flex-[2] h-10 text-sm"
          />
          <input
            type="text"
            value={nuevoCant}
            onChange={(e) => setNuevoCant(e.target.value)}
            placeholder="cant."
            className="input-base flex-1 h-10 text-sm"
          />
        </div>
        <div className="flex gap-2 items-center">
          <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] flex-1">
            {(['baja', 'normal', 'alta'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrioridad(p)}
                className={cn(
                  'h-8 rounded text-[10px] font-bold uppercase tracking-wider transition-colors',
                  prioridad === p
                    ? (p === 'alta' ? 'bg-rose-600 text-white' : p === 'normal' ? 'bg-cyan-600 text-white' : 'bg-zinc-700 text-white')
                    : 'text-zinc-500'
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={pending || !nuevoItem.trim()}
            className="btn-primary h-10 px-4 text-xs"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Agregar
          </button>
        </div>
      </form>

      {/* Items pendientes */}
      {pendientes.length === 0 ? (
        <p className="text-xs text-zinc-500 text-center py-3">No hay nada pendiente 🎉</p>
      ) : (
        <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
          {pendientes.map((i) => {
            const isPending = pendingId === i.id
            const priorColor =
              i.prioridad === 'alta'   ? 'text-rose-400 border-rose-500/40 bg-rose-500/10'
              : i.prioridad === 'baja' ? 'text-zinc-500 border-zinc-700 bg-zinc-700/10'
              :                          'text-cyan-400 border-cyan-500/40 bg-cyan-500/10'
            return (
              <li key={i.id} className="flex items-center gap-2 p-2.5">
                <button
                  type="button"
                  onClick={() => accion(() => marcarComprado(i.id), i.id)}
                  disabled={isPending}
                  className="h-7 w-7 rounded-md border border-zinc-700 hover:border-emerald-500 hover:bg-emerald-500/20 transition-colors inline-flex items-center justify-center shrink-0"
                  aria-label="Marcar comprado"
                >
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                </button>
                <div className="flex-1 min-w-0 leading-tight">
                  <p className="text-sm text-white truncate">{i.item}{i.cantidad && <span className="text-zinc-500"> · {i.cantidad}</span>}</p>
                  <p className="text-[10px] text-zinc-500">
                    {formatearFecha(i.created_at, 'dd MMM')}
                  </p>
                </div>
                <span className={cn('chip text-[9px] h-5 px-2 capitalize border', priorColor)}>
                  {i.prioridad}
                </span>
                <button
                  type="button"
                  onClick={() => accion(() => eliminarItem(i.id), i.id)}
                  disabled={isPending}
                  className="h-7 w-7 rounded text-zinc-500 hover:text-rose-400 inline-flex items-center justify-center shrink-0"
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Comprados recientes */}
      {comprados.length > 0 && (
        <details className="space-y-2">
          <summary className="cursor-pointer text-[10px] text-zinc-500 uppercase tracking-wider px-1">
            ✓ Recientes ({comprados.length})
          </summary>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden mt-2 opacity-60">
            {comprados.map((i) => {
              const isPending = pendingId === i.id
              return (
                <li key={i.id} className="flex items-center gap-2 p-2.5">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0 leading-tight">
                    <p className="text-xs text-zinc-400 line-through truncate">{i.item}</p>
                    {i.comprado_at && (
                      <p className="text-[10px] text-zinc-600">
                        {formatearFecha(i.comprado_at, 'dd MMM HH:mm')}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => accion(() => reabrirItem(i.id), i.id)}
                    disabled={isPending}
                    className="h-7 w-7 rounded text-zinc-500 hover:text-cyan-400 inline-flex items-center justify-center shrink-0"
                    aria-label="Reabrir"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </div>
  )
}
