import { Radar as RadarIcon, AlertTriangle, TrendingUp, Newspaper, MapPin, Sparkles } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { TZ } from '@/lib/fechas'
import { formatInTimeZone } from 'date-fns-tz'
import { EmptyState } from '@/components/ui/empty-state'
import { RadarRefreshButton } from '@/components/radar/refresh-button'
import { InsightCard } from '@/components/radar/insight-card'

const TIPO_META: Record<string, { icon: typeof Newspaper; color: string; label: string }> = {
  noticia:      { icon: Newspaper,      color: 'text-cyan-400',    label: 'Noticia' },
  tendencia:    { icon: TrendingUp,     color: 'text-emerald-400', label: 'Tendencia' },
  riesgo:       { icon: AlertTriangle,  color: 'text-rose-400',    label: 'Riesgo' },
  oportunidad:  { icon: Sparkles,       color: 'text-amber-400',   label: 'Oportunidad' },
  evento_local: { icon: MapPin,         color: 'text-purple-400',  label: 'Evento Local' },
}

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

export default async function RadarPage() {
  // Carga defensiva: cada query aislada con try/catch para que el page nunca crashee
  let insights: InsightRow[] = []
  let ultimaCorrida: RunRow | null = null
  let tableExists = true
  let errorMsg: string | null = null

  try {
    const admin = createAdminClient()

    try {
      const { data, error } = await admin
        .from('radar_insights')
        .select('id, tipo, titulo, resumen, fuente, fuente_url, impacto, aplica_a, recomendacion, fecha_evento, visto, created_at')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) {
        if (/relation.*does not exist|radar_insights/i.test(error.message)) {
          tableExists = false
        } else {
          errorMsg = error.message
        }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        insights = (data as any[]) ?? []
      }
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : 'Error consultando radar_insights'
    }

    try {
      const { data } = await admin
        .from('radar_runs')
        .select('created_at, insights_creados, error')
        .order('created_at', { ascending: false })
        .limit(1)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ultimaCorrida = ((data as any[]) ?? [])[0] ?? null
    } catch {
      // silencioso
    }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : 'Error inicializando admin client'
  }

  const altas = insights.filter((i) => i.impacto === 'alta')
  const medias = insights.filter((i) => i.impacto === 'media')
  const bajas = insights.filter((i) => i.impacto === 'baja')
  const noVistos = insights.filter((i) => !i.visto).length

  let ultimaCorridaTxt: string | null = null
  if (ultimaCorrida?.created_at) {
    try {
      ultimaCorridaTxt = formatInTimeZone(new Date(ultimaCorrida.created_at), TZ, 'dd MMM HH:mm')
    } catch {
      ultimaCorridaTxt = String(ultimaCorrida.created_at).slice(0, 16)
    }
  }

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
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
          IA analiza tu data y detecta tendencias, riesgos y oportunidades de tus negocios.
        </p>
        {ultimaCorridaTxt && (
          <p className="text-[10px] text-zinc-500">
            Última corrida: {ultimaCorridaTxt}
            {ultimaCorrida?.error && <span className="text-rose-400"> · error: {ultimaCorrida.error}</span>}
          </p>
        )}
        <RadarRefreshButton />
      </header>

      {errorMsg && (
        <div className="card border-rose-500/40 bg-rose-500/5 p-4 text-sm space-y-2">
          <p className="font-bold text-rose-300">Error al cargar Radar</p>
          <p className="text-[11px] text-rose-200/80 font-mono break-all">{errorMsg}</p>
          <p className="text-[10px] text-zinc-400">
            Copia este mensaje y mándamelo si necesitas que lo arregle.
          </p>
        </div>
      )}

      {!tableExists && (
        <div className="card border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-300">
          <p className="font-bold">Tabla radar no encontrada</p>
          <p className="text-[11px] text-amber-200/70 mt-1">
            Pega la migración 0014_radar.sql en Supabase para activar el Radar.
          </p>
        </div>
      )}

      {insights.length === 0 && tableExists && !errorMsg && (
        <EmptyState
          emoji="🛰️"
          title="Sin insights todavía"
          description="Toca 'Refrescar ahora' para que la IA analice tu data y genere insights."
        />
      )}

      {altas.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps inline-flex items-center gap-1.5 text-rose-300">
            <AlertTriangle className="h-3 w-3" /> Alto impacto ({altas.length})
          </h2>
          <div className="space-y-2">
            {altas.map((i) => <InsightCard key={i.id} insight={i} meta={TIPO_META[i.tipo] ?? TIPO_META.noticia} />)}
          </div>
        </section>
      )}

      {medias.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps">Impacto medio ({medias.length})</h2>
          <div className="space-y-2">
            {medias.map((i) => <InsightCard key={i.id} insight={i} meta={TIPO_META[i.tipo] ?? TIPO_META.noticia} />)}
          </div>
        </section>
      )}

      {bajas.length > 0 && (
        <section className="space-y-2 opacity-70">
          <h2 className="label-caps">Bajo impacto ({bajas.length})</h2>
          <div className="space-y-2">
            {bajas.map((i) => <InsightCard key={i.id} insight={i} meta={TIPO_META[i.tipo] ?? TIPO_META.noticia} />)}
          </div>
        </section>
      )}
    </div>
  )
}
