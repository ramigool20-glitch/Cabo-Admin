'use client'

import { useState, useTransition } from 'react'
import { ExternalLink, Check, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TZ } from '@/lib/fechas'
import { formatInTimeZone } from 'date-fns-tz'
import { marcarVisto, descartarInsight } from '@/app/(app)/radar/actions'
import { toast } from '@/components/ui/toast'

type Insight = {
  id: string
  tipo: string
  titulo: string
  resumen: string
  fuente: string | null
  fuente_url: string | null
  impacto: 'alta' | 'media' | 'baja'
  aplica_a: string[] | null
  recomendacion: string | null
  fecha_evento: string | null
  visto: boolean
  created_at: string
}

type Meta = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any
  color: string
  label: string
}

export function InsightCard({ insight, meta }: { insight: Insight; meta: Meta }) {
  const [hidden, setHidden] = useState(false)
  const [pending, setPending] = useState<'visto' | 'descartar' | null>(null)
  const [, startTransition] = useTransition()
  const Icon = meta.icon
  const fecha = formatInTimeZone(new Date(insight.created_at), TZ, 'dd MMM HH:mm')

  if (hidden) return null

  const handleVisto = () => {
    if (insight.visto) return
    setPending('visto')
    startTransition(async () => {
      await marcarVisto(insight.id)
      toast.success('Marcado como visto')
      setPending(null)
    })
  }

  const handleDescartar = () => {
    if (!confirm('¿Eliminar este insight?')) return
    setPending('descartar')
    startTransition(async () => {
      await descartarInsight(insight.id)
      setHidden(true)
      toast.info('Insight eliminado')
      setPending(null)
    })
  }

  const impactoBorder =
    insight.impacto === 'alta' ? 'border-rose-500/40 bg-rose-500/5'
    : insight.impacto === 'media' ? 'border-amber-500/30 bg-amber-500/5'
    : 'border-[var(--border-subtle)]'

  return (
    <article className={cn('card p-4 space-y-2', impactoBorder, !insight.visto && 'shadow-lg')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn('h-4 w-4 shrink-0', meta.color)} />
          <span className={cn('text-[9px] font-bold uppercase tracking-wider', meta.color)}>
            {meta.label}
          </span>
          {!insight.visto && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />}
        </div>
        <p className="text-[10px] text-zinc-500 shrink-0">{fecha}</p>
      </div>

      <h3 className="text-sm font-bold text-white leading-snug">{insight.titulo}</h3>
      <p className="text-xs text-zinc-300 leading-snug">{insight.resumen}</p>

      {insight.recomendacion && (
        <div className="rounded-lg bg-cyan-500/10 border border-cyan-500/30 p-2.5">
          <p className="text-[10px] font-bold text-cyan-300 uppercase tracking-wider">Recomendación</p>
          <p className="text-xs text-cyan-100 mt-0.5">{insight.recomendacion}</p>
        </div>
      )}

      {/* Tags y fuente */}
      <div className="flex items-center flex-wrap gap-1.5 text-[10px]">
        {(insight.aplica_a ?? []).map((tag) => (
          <span key={tag} className="chip text-[9px] h-4 px-1.5 capitalize">
            {tag.replace(/_/g, ' ')}
          </span>
        ))}
        {insight.fecha_evento && (
          <span className="chip chip-yellow text-[9px] h-4 px-1.5">📅 {insight.fecha_evento}</span>
        )}
        {insight.fuente && (
          <span className="text-zinc-500">· {insight.fuente}</span>
        )}
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-1.5 pt-1">
        {insight.fuente_url && (
          <a
            href={insight.fuente_url}
            target="_blank"
            rel="noreferrer"
            className="h-7 px-2.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10"
          >
            <ExternalLink className="h-3 w-3" />
            Fuente
          </a>
        )}
        {!insight.visto && (
          <button
            type="button"
            onClick={handleVisto}
            disabled={pending !== null}
            className="h-7 px-2.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
          >
            {pending === 'visto' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Visto
          </button>
        )}
        <button
          type="button"
          onClick={handleDescartar}
          disabled={pending !== null}
          className="h-7 px-2.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1 text-zinc-500 hover:text-rose-400 hover:border-rose-500/40 border border-transparent ml-auto disabled:opacity-50"
        >
          {pending === 'descartar' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </button>
      </div>
    </article>
  )
}
