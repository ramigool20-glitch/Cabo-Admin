import { formatearFecha } from '@/lib/fechas'
import { formatMoney, cn } from '@/lib/utils'
import { Sparkles, TrendingUp, TrendingDown } from 'lucide-react'

export type ResumenSemanalRow = {
  id: string
  semana_inicio: string
  semana_fin: string
  generado_at: string
  resumen_md: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  datos: any
}

export function ResumenSemanalCard({ row }: { row: ResumenSemanalRow }) {
  const d = row.datos as {
    total_ingresos_mxn: number
    total_gastos_mxn: number
    neto_mxn: number
    num_transacciones: number
    cambio_pct: { ingresos: number | null; gastos: number | null; neto: number | null }
  }

  const pctTxt = (p: number | null) => p == null ? null : (p >= 0 ? '+' : '') + p.toFixed(0) + '%'
  const pctColor = (p: number | null, esGasto = false) => {
    if (p == null) return 'text-zinc-500'
    if (esGasto) return p > 0 ? 'text-rose-300' : 'text-emerald-300'
    return p > 0 ? 'text-emerald-300' : 'text-rose-300'
  }

  return (
    <section className="rounded-2xl p-4 space-y-3 bg-gradient-to-br from-indigo-500/15 via-purple-500/8 to-cyan-500/10 border border-indigo-500/30">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-black text-white">Resumen semanal · IA</p>
            <p className="text-[10px] text-indigo-300/70">
              {formatearFecha(row.semana_inicio, 'dd MMM')} – {formatearFecha(row.semana_fin, 'dd MMM yyyy')}
            </p>
          </div>
        </div>
      </div>

      {/* Métricas clave */}
      <div className="grid grid-cols-3 gap-2">
        <Metric
          label="Ingresos"
          monto={d.total_ingresos_mxn}
          pct={pctTxt(d.cambio_pct.ingresos)}
          pctClass={pctColor(d.cambio_pct.ingresos)}
          icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-400" />}
        />
        <Metric
          label="Gastos"
          monto={d.total_gastos_mxn}
          pct={pctTxt(d.cambio_pct.gastos)}
          pctClass={pctColor(d.cambio_pct.gastos, true)}
          icon={<TrendingDown className="h-3.5 w-3.5 text-rose-400" />}
        />
        <Metric
          label="Neto"
          monto={d.neto_mxn}
          pct={pctTxt(d.cambio_pct.neto)}
          pctClass={pctColor(d.cambio_pct.neto)}
          highlight={d.neto_mxn >= 0 ? 'text-emerald-300' : 'text-rose-300'}
        />
      </div>

      {/* Narrativa IA — markdown simple */}
      <div className="rounded-lg bg-black/30 border border-indigo-500/20 p-3 text-[12px] leading-relaxed text-zinc-200 space-y-1.5">
        {parseMarkdownBullets(row.resumen_md).map((line, i) => (
          <p key={i} className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: line }} />
        ))}
      </div>

      <p className="text-[9px] text-zinc-500 text-right">
        Generado {formatearFecha(row.generado_at.slice(0, 10), 'dd MMM')} · {d.num_transacciones} tx
      </p>
    </section>
  )
}

function Metric({
  label, monto, pct, pctClass, icon, highlight,
}: {
  label: string
  monto: number
  pct: string | null
  pctClass: string
  icon?: React.ReactNode
  highlight?: string
}) {
  return (
    <div className="rounded-lg bg-black/30 border border-indigo-500/15 p-2">
      <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-zinc-500">
        {icon} {label}
      </div>
      <p className={cn('text-sm font-black tabular-nums', highlight ?? 'text-white')}>
        {formatMoney(monto, 'MXN')}
      </p>
      {pct && <p className={cn('text-[10px] font-bold tabular-nums', pctClass)}>{pct} vs sem. prev.</p>}
    </div>
  )
}

/** Mini-parser: bullets con "-" y **negritas**. Escapa HTML primero. */
function parseMarkdownBullets(md: string): string[] {
  const lines = md.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  return lines.map((l) => {
    const escaped = l.replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
    )
    let formatted = escaped.replace(/\*\*(.+?)\*\*/g, '<strong class="text-cyan-300">$1</strong>')
    formatted = formatted.replace(/\*(.+?)\*/g, '<em class="text-zinc-400">$1</em>')
    if (formatted.startsWith('- ')) {
      return '<span class="text-indigo-300">•</span> ' + formatted.slice(2)
    }
    if (formatted.startsWith('---')) return ''
    return formatted
  }).filter((l) => l.length > 0)
}
