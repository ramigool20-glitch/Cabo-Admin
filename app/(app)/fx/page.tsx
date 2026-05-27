import { createAdminClient } from '@/lib/supabase/admin'
import { getRateHoy } from '@/lib/fx/server'
import { formatearFecha, hoyEnCabos } from '@/lib/fechas'
import { TrendingUp, TrendingDown, DollarSign, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FxHistorialChart } from '@/components/fx/fx-historial-chart'
import { FxOverrideForm } from '@/components/fx/fx-override-form'

export default async function FxPage() {
  const admin = createAdminClient()
  const hoy = hoyEnCabos()

  // Asegura rate de hoy
  const rateHoy = await getRateHoy()

  // Últimos 30 días
  const { data: historial } = await admin
    .from('fx_rates')
    .select('fecha, rate_compra, rate_venta, mid_rate, source, manual')
    .order('fecha', { ascending: false })
    .limit(60)

  const lista = historial ?? []

  const ayer = lista.find((r) => r.fecha < hoy)
  const variacion = rateHoy && ayer
    ? Number(rateHoy.rate_compra) - Number(ayer.rate_compra)
    : null

  // Min/Max del mes
  const mes = hoy.slice(0, 7)
  const delMes = lista.filter((r) => r.fecha.startsWith(mes))
  const min = delMes.length ? Math.min(...delMes.map((r) => Number(r.rate_compra))) : null
  const max = delMes.length ? Math.max(...delMes.map((r) => Number(r.rate_compra))) : null
  const promedio = delMes.length
    ? delMes.reduce((sum, r) => sum + Number(r.rate_compra), 0) / delMes.length
    : null

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient">USD / MXN</h1>
          <a
            href="https://www.google.com/search?q=usd+to+mxn"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-cyan-400 inline-flex items-center gap-1"
          >
            Google <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <p className="text-sm text-zinc-400">
          Tipo de cambio del día (compra). Los ingresos USD se convierten con este rate.
        </p>
      </header>

      {/* Hero */}
      {rateHoy && (
        <section className="card-glow p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="label-caps">HOY · {formatearFecha(rateHoy.fecha, 'EEEE dd MMM')}</span>
            <span className="chip chip-cyan">{rateHoy.source}{rateHoy.manual && ' · manual'}</span>
          </div>
          <p className="text-5xl font-black tabular-nums text-cyan-300">
            ${Number(rateHoy.rate_compra).toFixed(2)} <span className="text-2xl text-zinc-500">MXN</span>
          </p>
          {variacion !== null && (
            <p className={cn(
              'text-sm font-bold tabular-nums inline-flex items-center gap-1',
              variacion > 0 ? 'text-emerald-400' : variacion < 0 ? 'text-rose-400' : 'text-zinc-400'
            )}>
              {variacion > 0 ? <TrendingUp className="h-4 w-4" /> : variacion < 0 ? <TrendingDown className="h-4 w-4" /> : null}
              {variacion > 0 ? '+' : ''}{variacion.toFixed(3)} vs ayer
            </p>
          )}
          {rateHoy.rate_venta && (
            <p className="text-xs text-zinc-500">
              Compra <strong className="text-zinc-300">${Number(rateHoy.rate_compra).toFixed(2)}</strong> ·
              Venta <strong className="text-zinc-300">${Number(rateHoy.rate_venta).toFixed(2)}</strong>
              {rateHoy.mid_rate && <> · Mid <strong className="text-zinc-300">${Number(rateHoy.mid_rate).toFixed(2)}</strong></>}
            </p>
          )}
        </section>
      )}

      {/* KPIs del mes */}
      {min !== null && max !== null && promedio !== null && (
        <div className="grid grid-cols-3 gap-2">
          <div className="card p-3">
            <p className="text-[10px] text-zinc-500">Min mes</p>
            <p className="text-sm font-bold tabular-nums text-rose-400">${min.toFixed(2)}</p>
          </div>
          <div className="card p-3">
            <p className="text-[10px] text-zinc-500">Promedio</p>
            <p className="text-sm font-bold tabular-nums text-cyan-400">${promedio.toFixed(2)}</p>
          </div>
          <div className="card p-3">
            <p className="text-[10px] text-zinc-500">Max mes</p>
            <p className="text-sm font-bold tabular-nums text-emerald-400">${max.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Gráfica histórica */}
      <FxHistorialChart data={[...lista].reverse().map((r) => ({
        fecha: r.fecha,
        rate: Number(r.rate_compra),
      }))} />

      {/* Override manual */}
      <section className="space-y-2">
        <h2 className="label-caps">Capturar manualmente</h2>
        <p className="text-xs text-zinc-500 px-1">
          Si Google está diferente al de tu casa de cambio, captura el rate real.
        </p>
        <FxOverrideForm rateActual={rateHoy ? Number(rateHoy.rate_compra) : null} fecha={hoy} />
      </section>

      {/* Histórico tabla */}
      <section className="space-y-2">
        <h2 className="label-caps">Historial</h2>
        <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
          {lista.map((r) => (
            <li key={r.fecha} className="flex items-center justify-between p-3">
              <div className="leading-tight">
                <p className="text-sm text-white">{formatearFecha(r.fecha, 'EEEE dd MMM yyyy')}</p>
                <p className="text-[10px] text-zinc-500">{r.source}{r.manual && ' · captura manual'}</p>
              </div>
              <p className="text-sm font-bold tabular-nums text-cyan-300">
                ${Number(r.rate_compra).toFixed(2)}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
