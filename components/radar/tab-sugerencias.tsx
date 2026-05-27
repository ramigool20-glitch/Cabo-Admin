'use client'

import { useTransition } from 'react'
import { Check, X, Target, ExternalLink, Loader2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from '@/components/ui/toast'
import { aceptarSugerencia, rechazarSugerencia } from '@/app/(app)/radar/actions'

export type Sugerencia = {
  id: string
  negocio_id: string
  competidor_nombre: string
  pagina_fb: string | null
  pagina_ig: string | null
  url: string | null
  motivo: string | null
  ads_activos_count: number
  keywords_match: string | null
  primera_vez_visto_at: string
  estado: string
}

export type NegocioMini = { id: string; nombre: string; tipo: string }

export function TabSugerencias({
  sugerencias,
  negocios,
  metaConfigurado,
  onChange,
}: {
  sugerencias: Sugerencia[]
  negocios: NegocioMini[]
  metaConfigurado: boolean
  onChange: () => void
}) {
  const [pending, start] = useTransition()

  if (!metaConfigurado) {
    return (
      <div className="card border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
        <p className="text-sm font-bold text-amber-300">Meta Ad Library no configurado</p>
        <p className="text-xs text-amber-200/80 leading-snug">
          Para descubrir competidores automáticamente necesitas un token de Meta Ad Library.
          Pasos:
        </p>
        <ol className="text-xs text-amber-100 space-y-1 list-decimal list-inside">
          <li>Crea cuenta en developers.facebook.com (gratis)</li>
          <li>Crea una app → tipo &quot;Business&quot;</li>
          <li>Activa el producto &quot;Ad Library API&quot;</li>
          <li>Genera un user access token (en Graph API Explorer)</li>
          <li>Agrega <code className="text-amber-50 bg-black/30 px-1 rounded">META_AD_LIBRARY_TOKEN</code> en Vercel env vars</li>
        </ol>
      </div>
    )
  }

  if (sugerencias.length === 0) {
    return (
      <EmptyState
        emoji="🎯"
        title="Sin sugerencias todavía"
        description="El radar buscará competidores que se anuncian con tus keywords. Configura keywords por negocio en la tab Competidores."
      />
    )
  }

  function handleAceptar(s: Sugerencia) {
    start(async () => {
      const r = await aceptarSugerencia(s.id)
      if (r.ok) {
        toast.success('Competidor aceptado', `${s.competidor_nombre} agregado a tu radar`)
        onChange()
      } else {
        toast.error('No se pudo aceptar', r.error)
      }
    })
  }

  function handleRechazar(s: Sugerencia) {
    start(async () => {
      const r = await rechazarSugerencia(s.id)
      if (r.ok) {
        toast.info('Rechazado')
        onChange()
      }
    })
  }

  // Agrupar por negocio
  const porNeg = new Map<string, Sugerencia[]>()
  for (const s of sugerencias) {
    if (!porNeg.has(s.negocio_id)) porNeg.set(s.negocio_id, [])
    porNeg.get(s.negocio_id)!.push(s)
  }

  return (
    <div className="space-y-4">
      {Array.from(porNeg.entries()).map(([negId, items]) => {
        const neg = negocios.find((n) => n.id === negId)
        return (
          <section key={negId} className="space-y-2">
            <h3 className="label-caps inline-flex items-center gap-1.5">
              <Target className="h-3 w-3 text-cyan-400" />
              {neg?.nombre ?? 'Negocio'}
              <span className="text-zinc-500">({items.length} sugeridos)</span>
            </h3>
            <ul className="space-y-2">
              {items.map((s) => (
                <li key={s.id} className="card p-3 space-y-2 border-purple-500/30">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{s.competidor_nombre}</p>
                      {s.motivo && <p className="text-xs text-zinc-400 mt-0.5">{s.motivo}</p>}
                      <div className="flex items-center gap-2 mt-2 flex-wrap text-[10px]">
                        <span className="chip chip-purple text-[9px] h-4 px-1.5">
                          📢 {s.ads_activos_count} ads
                        </span>
                        {s.keywords_match && (
                          <span className="chip text-[9px] h-4 px-1.5">kw: {s.keywords_match}</span>
                        )}
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noreferrer" className="text-cyan-400 inline-flex items-center gap-0.5">
                            <ExternalLink className="h-2.5 w-2.5" /> web
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleAceptar(s)}
                      disabled={pending}
                      className="flex-1 h-9 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 disabled:opacity-50"
                    >
                      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Aceptar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRechazar(s)}
                      disabled={pending}
                      className="flex-1 h-9 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1 bg-zinc-800 border border-zinc-700 text-zinc-400 disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                      Rechazar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
