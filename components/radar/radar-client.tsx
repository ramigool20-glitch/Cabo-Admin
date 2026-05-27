'use client'

import { useEffect, useState, useTransition } from 'react'
import { Radar as RadarIcon, AlertTriangle, TrendingUp, Newspaper, MapPin, Sparkles, RefreshCw, Loader2, Users, Plus, ExternalLink, Trash2, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TZ } from '@/lib/fechas'
import { formatInTimeZone } from 'date-fns-tz'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from '@/components/ui/toast'
import { refrescarRadar, marcarVisto, descartarInsight, agregarCompetidor, eliminarCompetidor } from '@/app/(app)/radar/actions'

type InsightRow = {
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

type Competidor = {
  id: string
  dominio_propio: string
  competidor_nombre: string
  competidor_url: string | null
  descripcion: string | null
  tipo: string
  notas: string | null
  created_at: string
}

type RunRow = { created_at: string; insights_creados: number; error: string | null }

type RadarData = {
  insights: InsightRow[]
  ultimaCorrida: RunRow | null
  competidores: Competidor[]
  errors: { tabla: string; msg: string }[]
}

const TIPO_META: Record<string, { icon: typeof Newspaper; color: string; label: string }> = {
  noticia:      { icon: Newspaper,      color: 'text-cyan-400',    label: 'Noticia' },
  tendencia:    { icon: TrendingUp,     color: 'text-emerald-400', label: 'Tendencia' },
  riesgo:       { icon: AlertTriangle,  color: 'text-rose-400',    label: 'Riesgo' },
  oportunidad:  { icon: Sparkles,       color: 'text-amber-400',   label: 'Oportunidad' },
  evento_local: { icon: MapPin,         color: 'text-purple-400',  label: 'Evento Local' },
}

export function RadarClient() {
  const [data, setData] = useState<RadarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<'insights' | 'competidores'>('insights')

  const load = async () => {
    setErr(null)
    try {
      const res = await fetch('/api/radar/data', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) {
        setErr(json.error || `HTTP ${res.status}`)
        setLoading(false)
        return
      }
      setData(json)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await refrescarRadar()
      if (res.ok) {
        toast.success('Radar actualizado', `${res.count ?? 0} insights nuevos`)
        await load()
      } else {
        toast.error('Falló el radar', res.error)
      }
    } finally {
      setRefreshing(false)
    }
  }

  const handleMarcarVisto = async (id: string) => {
    await marcarVisto(id)
    setData((d) => d ? { ...d, insights: d.insights.map((i) => i.id === id ? { ...i, visto: true } : i) } : d)
  }

  const handleDescartar = async (id: string) => {
    if (!confirm('¿Eliminar este insight?')) return
    await descartarInsight(id)
    setData((d) => d ? { ...d, insights: d.insights.filter((i) => i.id !== id) } : d)
    toast.info('Eliminado')
  }

  const insights = data?.insights ?? []
  const competidores = data?.competidores ?? []
  const altas = insights.filter((i) => i.impacto === 'alta')
  const medias = insights.filter((i) => i.impacto === 'media')
  const bajas = insights.filter((i) => i.impacto === 'baja')
  const noVistos = insights.filter((i) => !i.visto).length

  let ultimaCorridaTxt: string | null = null
  if (data?.ultimaCorrida?.created_at) {
    try {
      ultimaCorridaTxt = formatInTimeZone(new Date(data.ultimaCorrida.created_at), TZ, 'dd MMM HH:mm')
    } catch {
      ultimaCorridaTxt = data.ultimaCorrida.created_at.slice(0, 16)
    }
  }

  return (
    <div className="px-4 pt-5 pb-24 space-y-4 max-w-3xl mx-auto">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
            <RadarIcon className="h-6 w-6 text-cyan-400" />
            Radar
          </h1>
          {noVistos > 0 && (
            <span className="chip chip-cyan">{noVistos} sin ver</span>
          )}
        </div>
        <p className="text-sm text-zinc-400">
          IA analiza tu data, detecta tendencias y monitorea competidores.
        </p>
        {ultimaCorridaTxt && (
          <p className="text-[10px] text-zinc-500">
            Última corrida: {ultimaCorridaTxt}
            {data?.ultimaCorrida?.error && <span className="text-rose-400"> · {data.ultimaCorrida.error}</span>}
          </p>
        )}

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setTab('insights')}
            className={cn(
              'h-9 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold',
              tab === 'insights' ? 'bg-cyan-500 text-white shadow' : 'text-zinc-400'
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Insights ({insights.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('competidores')}
            className={cn(
              'h-9 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold',
              tab === 'competidores' ? 'bg-cyan-500 text-white shadow' : 'text-zinc-400'
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Competidores ({competidores.length})
          </button>
        </div>

        {tab === 'insights' && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="btn-primary w-full h-10 text-sm"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {refreshing ? 'Analizando…' : 'Refrescar análisis'}
          </button>
        )}
      </header>

      {/* Estado de carga / error */}
      {loading && (
        <div className="card p-6 text-center text-sm text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-cyan-400" />
          Cargando…
        </div>
      )}

      {err && (
        <div className="card border-rose-500/40 bg-rose-500/5 p-4 text-sm space-y-2">
          <p className="font-bold text-rose-300">Error</p>
          <p className="text-[11px] text-rose-200/80 font-mono break-all">{err}</p>
        </div>
      )}

      {data?.errors && data.errors.length > 0 && (
        <div className="card border-amber-500/40 bg-amber-500/5 p-3 space-y-1">
          <p className="text-xs font-bold text-amber-300">Falta pegar migración SQL:</p>
          {data.errors.map((e, i) => (
            <p key={i} className="text-[10px] text-amber-200/80">
              ⚠ Tabla <code className="text-amber-100">{e.tabla}</code>: {e.msg}
            </p>
          ))}
          <p className="text-[10px] text-zinc-400 mt-1">
            Pega las migraciones faltantes en Supabase y refresca.
          </p>
        </div>
      )}

      {/* TAB INSIGHTS */}
      {tab === 'insights' && !loading && !err && (
        <>
          {insights.length === 0 ? (
            <EmptyState
              emoji="🛰️"
              title="Sin insights todavía"
              description="Toca 'Refrescar análisis' para que la IA analice tu data."
            />
          ) : (
            <>
              {altas.length > 0 && <InsightsSection title="🚨 Alto impacto" insights={altas} onVisto={handleMarcarVisto} onDescartar={handleDescartar} />}
              {medias.length > 0 && <InsightsSection title="Impacto medio" insights={medias} onVisto={handleMarcarVisto} onDescartar={handleDescartar} />}
              {bajas.length > 0 && <InsightsSection title="Bajo impacto" insights={bajas} onVisto={handleMarcarVisto} onDescartar={handleDescartar} dimmed />}
            </>
          )}
        </>
      )}

      {/* TAB COMPETIDORES */}
      {tab === 'competidores' && !loading && !err && (
        <CompetidoresTab competidores={competidores} onReload={load} />
      )}
    </div>
  )
}

function InsightsSection({
  title,
  insights,
  onVisto,
  onDescartar,
  dimmed = false,
}: {
  title: string
  insights: InsightRow[]
  onVisto: (id: string) => void
  onDescartar: (id: string) => void
  dimmed?: boolean
}) {
  return (
    <section className={cn('space-y-2', dimmed && 'opacity-70')}>
      <h2 className="label-caps">{title} ({insights.length})</h2>
      <div className="space-y-2">
        {insights.map((i) => <InsightCard key={i.id} insight={i} onVisto={onVisto} onDescartar={onDescartar} />)}
      </div>
    </section>
  )
}

function InsightCard({ insight, onVisto, onDescartar }: { insight: InsightRow; onVisto: (id: string) => void; onDescartar: (id: string) => void }) {
  const meta = TIPO_META[insight.tipo] ?? TIPO_META.noticia
  const Icon = meta.icon
  let fecha = ''
  try {
    fecha = formatInTimeZone(new Date(insight.created_at), TZ, 'dd MMM HH:mm')
  } catch {
    fecha = (insight.created_at || '').slice(0, 16)
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
      <div className="flex items-center flex-wrap gap-1.5 text-[10px]">
        {(insight.aplica_a ?? []).map((tag) => (
          <span key={tag} className="chip text-[9px] h-4 px-1.5 capitalize">{tag.replace(/_/g, ' ')}</span>
        ))}
        {insight.fecha_evento && (
          <span className="chip chip-yellow text-[9px] h-4 px-1.5">📅 {insight.fecha_evento}</span>
        )}
        {insight.fuente && <span className="text-zinc-500">· {insight.fuente}</span>}
      </div>
      <div className="flex items-center gap-1.5 pt-1">
        {insight.fuente_url && (
          <a href={insight.fuente_url} target="_blank" rel="noreferrer" className="h-7 px-2.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1 border border-cyan-500/30 text-cyan-300">
            <ExternalLink className="h-3 w-3" />
            Fuente
          </a>
        )}
        {!insight.visto && (
          <button type="button" onClick={() => onVisto(insight.id)} className="h-7 px-2.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1 border border-emerald-500/30 text-emerald-300">
            ✓ Visto
          </button>
        )}
        <button type="button" onClick={() => onDescartar(insight.id)} className="h-7 px-2.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1 text-zinc-500 hover:text-rose-400 ml-auto">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </article>
  )
}

function CompetidoresTab({ competidores, onReload }: { competidores: Competidor[]; onReload: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [, startTransition] = useTransition()
  const [pending, setPending] = useState(false)
  const [pendingDel, setPendingDel] = useState<string | null>(null)

  // Agrupar por dominio
  const porDominio = new Map<string, Competidor[]>()
  for (const c of competidores) {
    if (!porDominio.has(c.dominio_propio)) porDominio.set(c.dominio_propio, [])
    porDominio.get(c.dominio_propio)!.push(c)
  }

  const handleAgregar = (formData: FormData) => {
    setPending(true)
    startTransition(async () => {
      const res = await agregarCompetidor(formData)
      if (res.ok) {
        toast.success('Competidor agregado')
        setShowForm(false)
        await onReload()
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
      await onReload()
      setPendingDel(null)
    })
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setShowForm((v) => !v)}
        className="btn-primary w-full h-10 text-sm"
      >
        <Plus className="h-4 w-4" />
        {showForm ? 'Cancelar' : 'Agregar competidor'}
      </button>

      {showForm && (
        <form
          action={handleAgregar}
          className="card-glow border-cyan-500/30 p-3 space-y-2"
        >
          <div className="space-y-1.5">
            <label className="label-caps">Mi dominio / negocio</label>
            <input
              name="dominio_propio"
              type="text"
              required
              placeholder="pagina_1, farmacia, rancho_mccoy…"
              list="dominios-comunes"
              className="input-base w-full h-10 text-sm"
            />
            <datalist id="dominios-comunes">
              <option value="farmacia" />
              <option value="consultorio" />
              <option value="rancho_mccoy" />
              <option value="pagina_1" />
              <option value="pagina_2" />
              <option value="pagina_3" />
              <option value="pagina_4" />
              <option value="pagina_5" />
              <option value="pagina_6" />
              <option value="pagina_7" />
              <option value="pagina_8" />
            </datalist>
          </div>

          <div className="space-y-1.5">
            <label className="label-caps">Nombre del competidor</label>
            <input
              name="competidor_nombre"
              type="text"
              required
              placeholder="Farmacia X, Hotel Y…"
              className="input-base w-full h-10 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="label-caps">URL (opcional)</label>
            <input
              name="competidor_url"
              type="url"
              placeholder="https://..."
              className="input-base w-full h-10 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="label-caps">Tipo</label>
            <select name="tipo" defaultValue="directo" className="input-base w-full h-10 text-sm">
              <option value="directo">Directo (mismo producto/servicio)</option>
              <option value="indirecto">Indirecto (sustituto)</option>
              <option value="referencia">Referencia (no compite pero observa)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="label-caps">Descripción / notas</label>
            <textarea
              name="descripcion"
              rows={2}
              placeholder="Qué venden, precio promedio, características clave…"
              className="input-base w-full text-sm !h-auto py-2 resize-none"
            />
          </div>

          <button type="submit" disabled={pending} className="btn-primary w-full h-9 text-xs">
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            Guardar competidor
          </button>
        </form>
      )}

      {competidores.length === 0 && !showForm && (
        <EmptyState
          emoji="🎯"
          title="Sin competidores registrados"
          description="Agrega tus competidores principales para que la IA los analice y compare con tus negocios."
        />
      )}

      {Array.from(porDominio.entries()).map(([dominio, comps]) => (
        <section key={dominio} className="space-y-1.5">
          <h3 className="label-caps inline-flex items-center gap-1.5">
            <Globe className="h-3 w-3 text-cyan-400" />
            {dominio.replace(/_/g, ' ')}
            <span className="text-zinc-500">({comps.length})</span>
          </h3>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {comps.map((c) => (
              <li key={c.id} className="p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{c.competidor_nombre}</p>
                    {c.descripcion && <p className="text-[11px] text-zinc-400 mt-0.5">{c.descripcion}</p>}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={cn('chip text-[9px] h-4 px-1.5 capitalize', c.tipo === 'directo' ? 'chip-red' : c.tipo === 'indirecto' ? 'chip-yellow' : 'chip-cyan')}>
                        {c.tipo}
                      </span>
                      {c.competidor_url && (
                        <a href={c.competidor_url} target="_blank" rel="noreferrer" className="text-[10px] text-cyan-400 inline-flex items-center gap-0.5">
                          <ExternalLink className="h-2.5 w-2.5" />
                          web
                        </a>
                      )}
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
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
