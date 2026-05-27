'use client'

import { useState, useTransition } from 'react'
import { Globe, ExternalLink, Trash2, Loader2, Plus, Megaphone, Shield, AlertTriangle, Settings, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from '@/components/ui/toast'
import { TZ } from '@/lib/fechas'
import { formatInTimeZone } from 'date-fns-tz'
import { agregarCompetidor, eliminarCompetidor, actualizarKeywordsNegocio } from '@/app/(app)/radar/actions'

export type Competidor = {
  id: string
  dominio_propio: string
  competidor_nombre: string
  competidor_url: string | null
  descripcion: string | null
  tipo: string
  negocio_id: string | null
  score_amenaza: number | null
  score_razon: string | null
  score_analisis_at: string | null
  keywords_match: string | null
  ultima_revision_at: string | null
  pagina_fb: string | null
  pagina_ig: string | null
  created_at: string
}

export type AdSnap = {
  id: string
  competidor_id: string
  ad_id: string
  page_name: string | null
  ad_creative_body: string | null
  ad_creative_link_title: string | null
  ad_snapshot_url: string | null
  inicio: string | null
  fin: string | null
  primera_vez_visto_at: string
  activo: boolean
}

export type NegocioCfg = {
  id: string
  nombre: string
  tipo: string
  keywords_busqueda: string | null
}

function scoreColor(s: number | null): string {
  if (s == null) return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40'
  if (s >= 8) return 'bg-rose-500/20 text-rose-300 border-rose-500/40'
  if (s >= 5) return 'bg-amber-500/20 text-amber-300 border-amber-500/40'
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
}

function scoreLabel(s: number | null): string {
  if (s == null) return 'sin analizar'
  if (s >= 8) return 'crítica'
  if (s >= 5) return 'media'
  return 'baja'
}

export function TabCompetidores({
  competidores,
  ads,
  negocios,
  onReload,
}: {
  competidores: Competidor[]
  ads: AdSnap[]
  negocios: NegocioCfg[]
  onReload: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [showKwForm, setShowKwForm] = useState(false)
  const [, startTransition] = useTransition()
  const [pending, setPending] = useState(false)
  const [pendingDel, setPendingDel] = useState<string | null>(null)

  // Agrupar ads por competidor
  const adsPorComp = new Map<string, AdSnap[]>()
  for (const a of ads) {
    if (!adsPorComp.has(a.competidor_id)) adsPorComp.set(a.competidor_id, [])
    adsPorComp.get(a.competidor_id)!.push(a)
  }

  const handleAgregar = (formData: FormData) => {
    setPending(true)
    startTransition(async () => {
      const res = await agregarCompetidor(formData)
      if (res.ok) {
        toast.success('Competidor agregado')
        setShowForm(false)
        onReload()
      } else {
        toast.error('No se pudo agregar', res.error)
      }
      setPending(false)
    })
  }

  const handleEliminar = (id: string) => {
    if (!confirm('¿Eliminar este competidor?')) return
    setPendingDel(id)
    startTransition(async () => {
      await eliminarCompetidor(id)
      toast.info('Competidor eliminado')
      onReload()
      setPendingDel(null)
    })
  }

  // Agrupar competidores por negocio_id (fallback: dominio_propio)
  const grupos = new Map<string, Competidor[]>()
  for (const c of competidores) {
    const key = c.negocio_id ?? `dominio:${c.dominio_propio}`
    if (!grupos.has(key)) grupos.set(key, [])
    grupos.get(key)!.push(c)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { setShowForm((v) => !v); setShowKwForm(false) }}
          className="btn-primary h-10 text-sm"
        >
          <Plus className="h-4 w-4" />
          {showForm ? 'Cancelar' : 'Agregar'}
        </button>
        <button
          type="button"
          onClick={() => { setShowKwForm((v) => !v); setShowForm(false) }}
          className="h-10 rounded-md text-sm font-bold inline-flex items-center justify-center gap-1.5 border border-cyan-500/30 text-cyan-300"
        >
          <Settings className="h-4 w-4" />
          {showKwForm ? 'Cerrar' : 'Keywords negocio'}
        </button>
      </div>

      {showKwForm && <KeywordsConfig negocios={negocios} onSaved={() => { setShowKwForm(false); onReload() }} />}

      {showForm && <CompetidorForm negocios={negocios} pending={pending} onSubmit={handleAgregar} />}

      {competidores.length === 0 && !showForm && !showKwForm && (
        <EmptyState
          emoji="🎯"
          title="Sin competidores registrados"
          description="Agrega tus competidores principales o configura keywords para que el radar los detecte automáticamente."
        />
      )}

      {Array.from(grupos.entries()).map(([key, comps]) => {
        const negocio = key.startsWith('dominio:') ? null : negocios.find((n) => n.id === key)
        const label = negocio?.nombre ?? key.replace('dominio:', '').replace(/_/g, ' ')
        return (
          <section key={key} className="space-y-2">
            <h3 className="label-caps inline-flex items-center gap-1.5">
              <Globe className="h-3 w-3 text-cyan-400" />
              {label}
              <span className="text-zinc-500">({comps.length})</span>
            </h3>
            <ul className="space-y-2">
              {comps.map((c) => {
                const adsList = adsPorComp.get(c.id) ?? []
                let ultRev = ''
                if (c.ultima_revision_at) {
                  try {
                    ultRev = formatInTimeZone(new Date(c.ultima_revision_at), TZ, 'dd MMM HH:mm')
                  } catch { ultRev = c.ultima_revision_at.slice(0, 10) }
                }
                return (
                  <li key={c.id} className="card p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-white truncate">{c.competidor_nombre}</p>
                          <span className={cn(
                            'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border',
                            scoreColor(c.score_amenaza)
                          )}>
                            {c.score_amenaza != null && c.score_amenaza >= 7 ? (
                              <AlertTriangle className="h-2.5 w-2.5" />
                            ) : (
                              <Shield className="h-2.5 w-2.5" />
                            )}
                            {c.score_amenaza != null ? `${c.score_amenaza}/10 · ${scoreLabel(c.score_amenaza)}` : 'sin analizar'}
                          </span>
                        </div>
                        {c.descripcion && <p className="text-[11px] text-zinc-400">{c.descripcion}</p>}
                        {c.score_razon && (
                          <p className="text-[10px] text-cyan-200/80 italic">💭 {c.score_razon}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={cn('chip text-[9px] h-4 px-1.5 capitalize', c.tipo === 'directo' ? 'chip-red' : c.tipo === 'indirecto' ? 'chip-yellow' : 'chip-cyan')}>
                            {c.tipo}
                          </span>
                          {c.competidor_url && (
                            <a href={c.competidor_url} target="_blank" rel="noreferrer" className="text-[10px] text-cyan-400 inline-flex items-center gap-0.5">
                              <ExternalLink className="h-2.5 w-2.5" /> web
                            </a>
                          )}
                          {adsList.length > 0 && (
                            <span className="text-[10px] text-amber-300 inline-flex items-center gap-0.5">
                              <Megaphone className="h-2.5 w-2.5" /> {adsList.length} ads activos
                            </span>
                          )}
                          {ultRev && <span className="text-[9px] text-zinc-600">· revisado {ultRev}</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleEliminar(c.id)}
                        disabled={pendingDel === c.id}
                        className="h-7 w-7 rounded text-zinc-500 hover:text-rose-400 inline-flex items-center justify-center shrink-0"
                      >
                        {pendingDel === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </button>
                    </div>

                    {/* Últimos ads detectados */}
                    {adsList.length > 0 && (
                      <details className="border-t border-zinc-800 pt-2 mt-2">
                        <summary className="text-[10px] text-amber-300 font-bold uppercase tracking-wider cursor-pointer">
                          🕵️ Ver {adsList.length} anuncios detectados
                        </summary>
                        <ul className="mt-2 space-y-1.5">
                          {adsList.slice(0, 5).map((a) => (
                            <li key={a.id} className="rounded-md bg-black/30 border border-amber-500/20 p-2">
                              {a.ad_creative_link_title && (
                                <p className="text-[11px] font-bold text-amber-200">{a.ad_creative_link_title}</p>
                              )}
                              {a.ad_creative_body && (
                                <p className="text-[10px] text-zinc-400 line-clamp-2">{a.ad_creative_body}</p>
                              )}
                              <div className="flex items-center gap-2 mt-1 text-[9px] text-zinc-500">
                                {a.inicio && <span>📅 {a.inicio}</span>}
                                {a.ad_snapshot_url && (
                                  <a href={a.ad_snapshot_url} target="_blank" rel="noreferrer" className="text-cyan-400 inline-flex items-center gap-0.5">
                                    <ExternalLink className="h-2.5 w-2.5" /> ver en Meta
                                  </a>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function CompetidorForm({
  negocios,
  pending,
  onSubmit,
}: {
  negocios: NegocioCfg[]
  pending: boolean
  onSubmit: (fd: FormData) => void
}) {
  return (
    <form action={onSubmit} className="card-glow border-cyan-500/30 p-3 space-y-2">
      <div className="space-y-1.5">
        <label className="label-caps">Negocio (opcional, recomendado)</label>
        <select name="negocio_id" defaultValue="" className="input-base w-full h-10 text-sm">
          <option value="">— Sin vincular —</option>
          {negocios.map((n) => (
            <option key={n.id} value={n.id}>{n.nombre}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="label-caps">Mi dominio (slug)</label>
        <input name="dominio_propio" type="text" required placeholder="farmacia, pagina_1..." className="input-base w-full h-10 text-sm" />
      </div>

      <div className="space-y-1.5">
        <label className="label-caps">Nombre del competidor</label>
        <input name="competidor_nombre" type="text" required placeholder="Farmacia X..." className="input-base w-full h-10 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="label-caps">FB Page (opcional)</label>
          <input name="pagina_fb" type="text" placeholder="@nombrefb" className="input-base w-full h-10 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="label-caps">Instagram</label>
          <input name="pagina_ig" type="text" placeholder="@usuario" className="input-base w-full h-10 text-sm" />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="label-caps">URL web (opcional)</label>
        <input name="competidor_url" type="url" placeholder="https://..." className="input-base w-full h-10 text-sm" />
      </div>

      <div className="space-y-1.5">
        <label className="label-caps">Tipo</label>
        <select name="tipo" defaultValue="directo" className="input-base w-full h-10 text-sm">
          <option value="directo">Directo</option>
          <option value="indirecto">Indirecto</option>
          <option value="referencia">Referencia</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="label-caps">Descripción / notas</label>
        <textarea name="descripcion" rows={2} placeholder="Qué venden, precios, características..." className="input-base w-full text-sm !h-auto py-2 resize-none" />
      </div>

      <button type="submit" disabled={pending} className="btn-primary w-full h-9 text-xs">
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        Guardar competidor
      </button>
    </form>
  )
}

function KeywordsConfig({
  negocios,
  onSaved,
}: {
  negocios: NegocioCfg[]
  onSaved: () => void
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(negocios.map((n) => [n.id, n.keywords_busqueda ?? '']))
  )
  const [savingId, setSavingId] = useState<string | null>(null)
  const [, start] = useTransition()

  function save(id: string) {
    setSavingId(id)
    start(async () => {
      const r = await actualizarKeywordsNegocio(id, drafts[id] ?? '')
      if (r.ok) {
        toast.success('Keywords guardadas')
        setSavingId(null)
        onSaved()
      } else {
        toast.error('No se guardó', r.error)
        setSavingId(null)
      }
    })
  }

  return (
    <div className="card-glow border-cyan-500/30 p-3 space-y-3">
      <p className="text-xs text-zinc-400 leading-snug">
        Define keywords por negocio. El radar los usa para buscar noticias en Google News y detectar competidores que se anuncian en Meta.
      </p>
      <ul className="space-y-2">
        {negocios.map((n) => (
          <li key={n.id} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">{n.nombre}</span>
              <span className="text-[9px] text-zinc-500 capitalize">{n.tipo.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex gap-1.5">
              <input
                value={drafts[n.id] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [n.id]: e.target.value }))}
                placeholder="tequila cabo, regalo turistas, mezcal premium..."
                className="input-base flex-1 h-9 text-xs"
              />
              <button
                type="button"
                onClick={() => save(n.id)}
                disabled={savingId === n.id}
                className="h-9 px-3 rounded-md text-xs font-bold inline-flex items-center gap-1 bg-cyan-500 text-white disabled:opacity-50"
              >
                {savingId === n.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              </button>
            </div>
            <p className="text-[9px] text-zinc-600">Separa con comas. Idealmente 2-5 frases.</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
