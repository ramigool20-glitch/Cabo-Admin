'use client'

import { useState, useTransition } from 'react'
import { Check, X, Loader2 } from 'lucide-react'
import { cerrarPendiente, descartarTodosPendientes } from '@/app/(app)/auditor/actions'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { TZ } from '@/lib/fechas'
import { formatInTimeZone } from 'date-fns-tz'

type Pendiente = {
  id: string
  pregunta: string
  prioridad: 'alta' | 'media' | 'baja'
  contexto: string | null
  created_at: string
}

const PRIORIDAD_CHIP = {
  alta: 'chip-red',
  media: 'chip-yellow',
  baja: 'chip-cyan',
}

export function PendientesList({ pendientes }: { pendientes: Pendiente[] }) {
  const [pending, setPending] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [items, setItems] = useState(pendientes)

  const cerrar = (id: string, accion: 'resuelta' | 'descartada') => {
    setPending(id)
    startTransition(async () => {
      const res = await cerrarPendiente(id, accion)
      if (res.ok) {
        setItems((prev) => prev.filter((p) => p.id !== id))
        toast.success(accion === 'resuelta' ? '✓ Resuelta' : 'Descartada')
      } else {
        toast.error('No se pudo cerrar', res.error)
      }
      setPending(null)
    })
  }

  const descartarTodos = () => {
    if (!confirm(`¿Descartar las ${items.length} preguntas pendientes? Esto las marca como resueltas sin responderlas.`)) return
    startTransition(async () => {
      const res = await descartarTodosPendientes()
      if (res.ok) {
        setItems([])
        toast.info('Todas las pendientes descartadas')
      } else {
        toast.error('No se pudo descartar', res.error)
      }
    })
  }

  if (items.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="label-caps">📌 Pendientes ({items.length})</p>
        {items.length > 1 && (
          <button
            type="button"
            onClick={descartarTodos}
            className="text-[10px] text-zinc-500 hover:text-rose-400 transition-colors"
          >
            Descartar todos
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {items.map((p) => {
          const isPending = pending === p.id
          const hora = formatInTimeZone(new Date(p.created_at), TZ, 'dd MMM HH:mm')
          return (
            <div key={p.id} className="card p-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className={cn('chip text-[9px] h-5 px-2 shrink-0 mt-0.5', PRIORIDAD_CHIP[p.prioridad])}>
                  {p.prioridad}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-200">{p.pregunta}</p>
                  {p.contexto && <p className="text-xs text-zinc-500 mt-0.5">{p.contexto}</p>}
                  <p className="text-[10px] text-zinc-600 mt-1">creada {hora}</p>
                </div>
              </div>
              <div className="flex gap-1.5 pl-12">
                <button
                  type="button"
                  onClick={() => cerrar(p.id, 'resuelta')}
                  disabled={isPending}
                  className="h-7 px-3 rounded-md text-[11px] font-bold inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
                >
                  {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Resuelta
                </button>
                <button
                  type="button"
                  onClick={() => cerrar(p.id, 'descartada')}
                  disabled={isPending}
                  className="h-7 px-3 rounded-md text-[11px] font-bold inline-flex items-center gap-1 border border-zinc-700 text-zinc-400 hover:text-rose-400 hover:border-rose-500/40 disabled:opacity-50 transition-colors"
                >
                  <X className="h-3 w-3" />
                  Descartar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
