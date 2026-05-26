import { TrendingUp, ShoppingCart, Target, BadgePercent } from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import type { MetricasPagina } from '@/lib/roas'

export function RoasCard({ m, moneda = 'MXN' }: { m: MetricasPagina; moneda?: 'MXN' | 'USD' }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Métricas de página digital
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Metric
          icon={Target}
          color="text-emerald-600"
          label="ROAS"
          value={m.roas === null ? '—' : `${m.roas.toFixed(2)}×`}
          hint={m.roas !== null && m.roas >= 1 ? 'Rentable' : 'Por debajo de 1'}
        />
        <Metric
          icon={BadgePercent}
          color="text-blue-600"
          label="Margen real"
          value={m.margen_pct === null ? '—' : `${(m.margen_pct * 100).toFixed(1)}%`}
          hint={formatMoney(m.margen_real, moneda)}
        />
        <Metric
          icon={ShoppingCart}
          color="text-purple-600"
          label="Ventas"
          value={formatMoney(m.ventas, moneda)}
          hint={`${m.num_ventas} ${m.num_ventas === 1 ? 'venta' : 'ventas'}`}
        />
        <Metric
          icon={TrendingUp}
          color="text-amber-600"
          label="Costo / venta"
          value={m.costo_por_venta === null ? '—' : formatMoney(m.costo_por_venta, moneda)}
          hint={`Ads: ${formatMoney(m.gasto_ads, moneda)}`}
        />
      </div>
    </div>
  )
}

function Metric({
  icon: Icon,
  color,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  color: string
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border bg-zinc-50 dark:bg-zinc-950 p-3 space-y-1">
      <div className={`flex items-center gap-1 ${color}`}>
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-zinc-500">{hint}</p>}
    </div>
  )
}
