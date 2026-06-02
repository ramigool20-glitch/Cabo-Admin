'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import type { CashflowForecast } from '@/lib/cashflow/forecast'

const TIPO_LABEL: Record<string, { emoji: string; label: string }> = {
  gasto_recurrente:   { emoji: '🔁', label: 'Recurrente' },
  cuenta_por_pagar:   { emoji: '📌', label: 'Por pagar' },
  cuenta_por_cobrar:  { emoji: '💰', label: 'Por cobrar' },
  cobro_stripe:       { emoji: '💳', label: 'Stripe' },
}

export function CashflowForecastCard({ f }: { f: CashflowForecast }) {
  const [ventana, setVentana] = useState<30 | 60 | 90>(30)
  const r = f.resumen
  const final = ventana === 30 ? r.final_30d : ventana === 60 ? r.final_60d : r.final_90d
  const entradas = ventana === 30 ? r.entradas_30d : ventana === 60 ? r.entradas_60d : r.entradas_90d
  const salidas = ventana === 30 ? r.salidas_30d : ventana === 60 ? r.salidas_60d : r.salidas_90d

  // Top 5 próximos eventos dentro de la ventana seleccionada
  const limite = new Date(f.hoy + 'T12:00:00')
  limite.setDate(limite.getDate() + ventana)
  const limiteStr = limite.toISOString().slice(0, 10)
  const eventosVentana = f.eventos.filter((e) => e.fecha <= limiteStr).slice(0, 5)

  const huecoEnVentana = f.hueco_alerta && f.hueco_alerta.dias_a_partir_de_hoy <= ventana

  return (
    <section className="card-glow p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">📈</span>
          <p className="text-sm font-black text-white">Proyección de saldo</p>
        </div>
        {/* Tabs 30/60/90 */}
        <div className="grid grid-cols-3 gap-0.5 p-0.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]">
          {([30, 60, 90] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setVentana(d)}
              className={cn(
                'h-7 px-2.5 rounded text-[11px] font-bold',
                ventana === d ? 'bg-cyan-500 text-white' : 'text-zinc-400',
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Saldo actual + proyectado */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-black/30 p-2.5">
          <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Saldo hoy</p>
          <p className="text-base font-black tabular-nums text-white">{formatMoney(f.saldo_actual_mxn, 'MXN')}</p>
        </div>
        <div className={cn(
          'rounded-lg p-2.5',
          final < 0 ? 'bg-rose-500/10 border border-rose-500/30' : 'bg-emerald-500/10 border border-emerald-500/30',
        )}>
          <p className={cn('text-[9px] uppercase tracking-wider', final < 0 ? 'text-rose-300' : 'text-emerald-300')}>
            Saldo en {ventana}d
          </p>
          <p className={cn('text-base font-black tabular-nums', final < 0 ? 'text-rose-200' : 'text-emerald-200')}>
            {formatMoney(final, 'MXN')}
          </p>
        </div>
      </div>

      {/* Entradas / Salidas */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
          <div className="leading-tight">
            <p className="text-[9px] text-zinc-500">Entradas agendadas</p>
            <p className="font-bold tabular-nums text-emerald-300">+{formatMoney(entradas, 'MXN')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
          <div className="leading-tight">
            <p className="text-[9px] text-zinc-500">Salidas agendadas</p>
            <p className="font-bold tabular-nums text-rose-300">−{formatMoney(salidas, 'MXN')}</p>
          </div>
        </div>
      </div>

      {/* Alerta hueco */}
      {huecoEnVentana && f.hueco_alerta && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
          <div className="flex-1 leading-tight">
            <p className="text-[11px] font-bold text-amber-200">
              ⚠️ Hueco de liquidez proyectado
            </p>
            <p className="text-[10px] text-amber-200/80">
              El {formatearFecha(f.hueco_alerta.fecha, 'EEE dd MMM')} ({f.hueco_alerta.dias_a_partir_de_hoy === 0 ? 'HOY' : `en ${f.hueco_alerta.dias_a_partir_de_hoy}d`}) caería a {formatMoney(f.hueco_alerta.saldo_mxn, 'MXN')}.
              No incluye ventas no agendadas.
            </p>
          </div>
        </div>
      )}

      {/* Promedio histórico contexto */}
      <div className="rounded-lg bg-[var(--bg-input)]/50 border border-[var(--border-subtle)] p-2 text-[10px] text-zinc-400 leading-snug">
        <span className="text-zinc-500 uppercase tracking-wider text-[9px] font-bold">Contexto · últimos 30d reales</span>
        <div className="grid grid-cols-3 gap-1 mt-1">
          <span><span className="text-emerald-400">+${formatNumber(f.promedio_historico.entradas_diarias_mxn)}</span>/d entr.</span>
          <span><span className="text-rose-400">−${formatNumber(f.promedio_historico.salidas_diarias_mxn)}</span>/d sal.</span>
          <span className={f.promedio_historico.neto_diario_mxn >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
            neto ${formatNumber(f.promedio_historico.neto_diario_mxn)}/d
          </span>
        </div>
      </div>

      {/* Próximos eventos */}
      {eventosVentana.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] uppercase tracking-wider font-bold text-zinc-500">Próximos {eventosVentana.length} de {f.eventos.length}</p>
          <ul className="space-y-0.5">
            {eventosVentana.map((e, i) => {
              const meta = TIPO_LABEL[e.tipo]
              const dias = Math.ceil((new Date(e.fecha + 'T12:00:00').getTime() - new Date(f.hoy + 'T12:00:00').getTime()) / 86_400_000)
              return (
                <li key={i} className="flex items-center gap-2 text-[11px]">
                  <span>{meta?.emoji ?? '·'}</span>
                  <div className="flex-1 min-w-0 leading-tight">
                    <p className="text-zinc-200 truncate">{e.concepto}</p>
                    <p className="text-[9px] text-zinc-500">{formatearFecha(e.fecha, 'EEE dd MMM')} · {dias === 0 ? 'hoy' : `en ${dias}d`}</p>
                  </div>
                  <p className={cn('font-bold tabular-nums', e.monto_mxn >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                    {e.monto_mxn >= 0 ? '+' : '−'}{formatMoney(Math.abs(e.monto_mxn), 'MXN')}
                  </p>
                </li>
              )
            })}
          </ul>
          <Link href="/cashflow" className="flex items-center justify-end gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 pt-1">
            Ver detalle <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </section>
  )
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-MX', { maximumFractionDigits: 0 })
}
