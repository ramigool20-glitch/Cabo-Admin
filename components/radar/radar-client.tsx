'use client'

import { useEffect, useState } from 'react'
import { Radar as RadarIcon, AlertTriangle, TrendingUp, Newspaper, MapPin, Sparkles, RefreshCw, Loader2, Users, Trash2, ExternalLink, Target, Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TZ } from '@/lib/fechas'
import { formatInTimeZone } from 'date-fns-tz'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from '@/components/ui/toast'
import { refrescarRadar, marcarVisto, descartarInsight, forzarMonitor } from '@/app/(app)/radar/actions'
import { TabNoticias, type Noticia } from './tab-noticias'
import { TabSugerencias, type Sugerencia } from './tab-sugerencias'
import { TabCompetidores, type Competidor, type AdSnap, type NegocioCfg } from './tab-competidores'

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

type RunRow = { created_at: string; insights_creados: number; error: string | null }

type RadarData = {
  insights: InsightRow[]
  ultimaCorrida: RunRow | null
  competidores: Competidor[]
  noticias: Noticia[]
  sugerencias: Sugerencia[]
  adsActivos: AdSnap[]
  negocios: NegocioCfg[]
  metaConfigurado: boolean
  errors: { tabla: string; msg: string }[]
}

type Tab = 'insights' | 'noticias' | 'competidores' | 'sugerencias'

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
  const [monitoring, setMonitoring] = useState(false)
  const [tab, setTab] = useState<Tab>('insights')

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

  const handleRefreshInsights = async () => {
    setRefreshing(true)
    try {
      const res = await refrescarRadar()
      if (res.ok) {
        toast.success('Insights actualizados', `${res.count ?? 0} nuevos`)
        await load()
      } else {
        toast.error('Falló', res.error)
      }
    } finally {
      setRefreshing(false)
    }
  }

  const handleMonitor = async () => {
    setMonitoring(true)
    try {
      const res = await forzarMonitor()
      if (res.ok) {
        const r = res as { ok: true; noticias_guardadas: number; ads_nuevos: number; sugerencias_nuevas: number; scores_recalculados: number; errores: string[] }
        toast.success(
          'Monitor completo',
          `${r.noticias_guardadas} noticias · ${r.ads_nuevos} ads nuevos · ${r.sugerencias_nuevas} sugerencias`
        )
        if (r.errores.length > 0) {
          console.warn('Errores monitor:', r.errores)
        }
        await load()
      } else {
        toast.error('Falló monitor', res.error)
      }
    } finally {
      setMonitoring(false)
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
  const noticias = data?.noticias ?? []
  const sugerencias = data?.sugerencias ?? []
  const adsActivos = data?.adsActivos ?? []
  const negocios = data?.negocios ?? []
  const metaConfigurado = data?.metaConfigurado ?? false

  const altas = insights.filter((i) => i.impacto === 'alta')
  const medias = insights.filter((i) => i.impacto === 'media')
  const bajas = insights.filter((i) => i.impacto === 'baja')
  const noVistosInsights = insights.filter((i) => !i.visto).length
  const noVistosNoticias = noticias.filter((n) => !n.vista).length

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
          {(noVistosInsights > 0 || noVistosNoticias > 0) && (
            <span className="chip chip-cyan">{noVistosInsights + noVistosNoticias} nuevo{noVistosInsights + noVistosNoticias > 1 ? 's' : ''}</span>
          )}
        </div>
        <p className="text-sm text-zinc-400">
          Noticias frescas, espionaje de ads y análisis IA de tu negocio.
        </p>
        {ultimaCorridaTxt && (
          <p className="text-[10px] text-zinc-500">
            Última corrida: {ultimaCorridaTxt}
            {data?.ultimaCorrida?.error && <span className="text-rose-400"> · errores</span>}
          </p>
        )}

        {/* Tabs */}
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
          <TabBtn active={tab === 'insights'} onClick={() => setTab('insights')} icon={Sparkles} label="Insights" count={insights.length} />
          <TabBtn active={tab === 'noticias'} onClick={() => setTab('noticias')} icon={Newspaper} label="Noticias" count={noticias.length} />
          <TabBtn active={tab === 'competidores'} onClick={() => setTab('competidores')} icon={Users} label="Competidores" count={competidores.length} />
          <TabBtn active={tab === 'sugerencias'} onClick={() => setTab('sugerencias')} icon={Target} label="Sugeridos" count={sugerencias.length} badge={sugerencias.length > 0} />
        </div>

        {/* Botones de refresh */}
        <div className="grid grid-cols-2 gap-2">
          {tab === 'insights' && (
            <button
              type="button"
              onClick={handleRefreshInsights}
              disabled={refreshing || loading}
              className="btn-primary h-10 text-sm col-span-2"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {refreshing ? 'Analizando…' : 'Refrescar análisis'}
            </button>
          )}
          {(tab === 'noticias' || tab === 'competidores' || tab === 'sugerencias') && (
            <button
              type="button"
              onClick={handleMonitor}
              disabled={monitoring || loading}
              className="btn-primary h-10 text-sm col-span-2"
            >
              {monitoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              {monitoring ? 'Monitoreando…' : 'Refrescar noticias + ads'}
            </button>
          )}
        </div>
      </header>

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
            Pega <code className="text-amber-100">0018_radar_inteligencia.sql</code> en Supabase y refresca.
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

      {/* TAB NOTICIAS */}
      {tab === 'noticias' && !loading && !err && (
        <TabNoticias noticias={noticias} onChange={load} />
      )}

      {/* TAB COMPETIDORES */}
      {tab === 'competidores' && !loading && !err && (
        <TabCompetidores competidores={competidores} ads={adsActivos} negocios={negocios} onReload={load} />
      )}

      {/* TAB SUGERENCIAS */}
      {tab === 'sugerencias' && !loading && !err && (
        <TabSugerencias sugerencias={sugerencias} negocios={negocios} metaConfigurado={metaConfigurado} onChange={load} />
      )}
    </div>
  )
}

function TabBtn({
  active, onClick, icon: Icon, label, count, badge,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Newspaper
  label: string
  count: number
  badge?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-9 inline-flex flex-col items-center justify-center gap-0 rounded-lg text-[10px] font-bold relative',
        active ? 'bg-cyan-500 text-white shadow' : 'text-zinc-400'
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="text-[9px] leading-none mt-0.5">{label}</span>
      {count > 0 && (
        <span className={cn('absolute -top-1 -right-1 h-3.5 min-w-[14px] px-1 rounded-full text-[8px] font-bold inline-flex items-center justify-center', badge ? 'bg-amber-500 text-white' : 'bg-zinc-700 text-zinc-300')}>
          {count}
        </span>
      )}
    </button>
  )
}

function InsightsSection({
  title, insights, onVisto, onDescartar, dimmed = false,
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
          <span className={cn('text-[9px] font-bold uppercase tracking-wider', meta.color)}>{meta.label}</span>
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
          <a href={insight.fuente_url} target={insight.fuente_url.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="h-7 px-2.5 rounded-md text-[10px] font-bold inline-flex items-center gap-1 border border-cyan-500/30 text-cyan-300">
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
