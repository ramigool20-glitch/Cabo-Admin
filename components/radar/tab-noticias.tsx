'use client'

import { useTransition } from 'react'
import { ExternalLink, Newspaper, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TZ } from '@/lib/fechas'
import { formatInTimeZone } from 'date-fns-tz'
import { EmptyState } from '@/components/ui/empty-state'
import { marcarNoticiaVista } from '@/app/(app)/radar/actions'

export type Noticia = {
  id: string
  titulo: string
  resumen: string | null
  url: string
  fuente: string | null
  fuente_logo_url: string | null
  imagen_url: string | null
  publicada_at: string | null
  query_origen: string
  aplica_a: string[] | null
  fetched_at: string
  vista: boolean
}

function fmtFecha(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const diffH = (Date.now() - d.getTime()) / (1000 * 60 * 60)
    if (diffH < 1) return 'hace minutos'
    if (diffH < 24) return `hace ${Math.floor(diffH)}h`
    return formatInTimeZone(d, TZ, 'dd MMM HH:mm')
  } catch {
    return iso.slice(0, 16)
  }
}

export function TabNoticias({ noticias, onChange }: { noticias: Noticia[]; onChange: () => void }) {
  const [, start] = useTransition()

  if (noticias.length === 0) {
    return (
      <EmptyState
        emoji="📰"
        title="Sin noticias todavía"
        description="El radar trae noticias de Google News para tus negocios. Refresca para empezar."
      />
    )
  }

  function handleVisto(id: string) {
    start(async () => {
      await marcarNoticiaVista(id)
      onChange()
    })
  }

  return (
    <div className="space-y-2">
      {noticias.map((n) => (
        <article
          key={n.id}
          className={cn(
            'card p-3 space-y-2',
            !n.vista && 'border-cyan-500/40 bg-cyan-500/5'
          )}
        >
          <div className="flex items-start gap-3">
            {n.imagen_url ? (
              <img
                src={n.imagen_url}
                alt=""
                className="h-16 w-16 rounded-lg object-cover shrink-0 bg-zinc-900"
                loading="lazy"
              />
            ) : (
              <div className="h-16 w-16 rounded-lg bg-cyan-500/10 border border-cyan-500/30 shrink-0 inline-flex items-center justify-center">
                <Newspaper className="h-6 w-6 text-cyan-400" />
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                {n.fuente_logo_url && (
                  <img src={n.fuente_logo_url} alt="" className="h-3 w-3 rounded" loading="lazy" />
                )}
                {n.fuente && <span className="font-medium">{n.fuente}</span>}
                <span>·</span>
                <span>{fmtFecha(n.publicada_at)}</span>
                {!n.vista && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 ml-auto" />}
              </div>
              <h3 className="text-sm font-bold text-white leading-snug">{n.titulo}</h3>
              {n.resumen && <p className="text-xs text-zinc-400 leading-snug line-clamp-3">{n.resumen}</p>}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(n.aplica_a ?? []).slice(0, 3).map((tag) => (
              <span key={tag} className="chip text-[9px] h-4 px-1.5 capitalize">{tag.replace(/_/g, ' ')}</span>
            ))}
            <a
              href={n.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto h-7 px-2.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1 border border-cyan-500/30 text-cyan-300"
            >
              <ExternalLink className="h-3 w-3" />
              Leer
            </a>
            {!n.vista && (
              <button
                type="button"
                onClick={() => handleVisto(n.id)}
                className="h-7 px-2.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1 border border-emerald-500/30 text-emerald-300"
              >
                <Check className="h-3 w-3" />
                Visto
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  )
}
