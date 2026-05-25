'use client'

import { useTransition } from 'react'
import { Check, RotateCcw, AlertTriangle, Clock } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { completarTarea, reabrirTarea } from '@/app/(app)/tareas/actions'

export type TareaListItem = {
  id: string
  titulo: string
  descripcion: string | null
  fecha_limite: string
  prioridad: 'alta' | 'media' | 'baja'
  estado: 'pendiente' | 'en_progreso' | 'completada' | 'vencida'
  asignada_a_nombres: string[]
  multa_monto: number | null
  moneda_multa: 'MXN' | 'USD'
  negocio_nombre?: string | null
  categoria: string | null
}

const prioColor = {
  alta:  'border-rose-500/40 bg-rose-500/5',
  media: 'border-amber-500/40 bg-amber-500/5',
  baja:  'border-emerald-500/40 bg-emerald-500/5',
}

const estadoChip = {
  pendiente:   { l: 'Pendiente',   c: 'chip-yellow' },
  en_progreso: { l: 'En progreso', c: 'chip-cyan' },
  completada:  { l: 'Completada',  c: 'chip-green' },
  vencida:     { l: 'Vencida',     c: 'chip-red' },
}

export function TareaRow({ tarea }: { tarea: TareaListItem }) {
  const [pending, startTransition] = useTransition()
  const done = tarea.estado === 'completada'
  const vencida = tarea.estado === 'vencida'

  const handleToggle = () => {
    startTransition(async () => {
      if (done) await reabrirTarea(tarea.id)
      else await completarTarea(tarea.id)
    })
  }

  const fechaLimiteDate = new Date(tarea.fecha_limite)
  const fechaStr = fechaLimiteDate.toLocaleString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
  })

  return (
    <li className={cn('card border-l-4 p-3.5 space-y-2', prioColor[tarea.prioridad])}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={handleToggle}
          disabled={pending}
          aria-label={done ? 'Reabrir' : 'Completar'}
          className={cn(
            'h-6 w-6 shrink-0 rounded-full border-2 inline-flex items-center justify-center transition-colors',
            done
              ? 'bg-emerald-500 border-emerald-500'
              : 'border-zinc-500 hover:border-cyan-400'
          )}
        >
          {done && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
        </button>

        <div className="flex-1 min-w-0 space-y-1">
          <p className={cn(
            'text-sm font-semibold leading-tight',
            done ? 'line-through text-zinc-500' : 'text-zinc-100'
          )}>
            {tarea.titulo}
          </p>
          {tarea.descripcion && (
            <p className="text-xs text-zinc-500 leading-snug">{tarea.descripcion}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className={cn('chip', estadoChip[tarea.estado].c, 'text-[9px] h-5 px-2')}>
              {estadoChip[tarea.estado].l}
            </span>
            <span className="chip text-[9px] h-5 px-2">
              <Clock className="h-2.5 w-2.5" /> {fechaStr}
            </span>
            {tarea.asignada_a_nombres.length > 0 && (
              <span className="chip text-[9px] h-5 px-2">
                👤 {tarea.asignada_a_nombres.join(' + ')}
              </span>
            )}
            {tarea.negocio_nombre && (
              <span className="chip text-[9px] h-5 px-2">🏢 {tarea.negocio_nombre}</span>
            )}
            {tarea.multa_monto && tarea.multa_monto > 0 && (
              <span className="chip text-[9px] h-5 px-2 chip-red">
                <AlertTriangle className="h-2.5 w-2.5" /> Multa {formatMoney(tarea.multa_monto, tarea.moneda_multa)}
              </span>
            )}
          </div>
        </div>

        {done && (
          <button
            type="button"
            onClick={handleToggle}
            disabled={pending}
            aria-label="Reabrir"
            className="text-zinc-500 hover:text-cyan-400 p-1"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  )
}
