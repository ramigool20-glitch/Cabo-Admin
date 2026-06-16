/**
 * Mini chart de tendencia mensual — barras + valor encima.
 * Sin libs, SVG inline. Auto-escala al máximo del periodo.
 */

import { formatMoney } from '@/lib/utils'

export function TendenciaChart({
  data,
}: {
  data: Array<{ key: string; label: string; ingresos: number; costo: number; ganancia: number }>
}) {
  const max = Math.max(...data.map(d => d.ganancia), 1)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 gap-1 items-end h-32">
        {data.map((m, i) => {
          const heightPct = (m.ganancia / max) * 100
          const esActual = i === data.length - 1
          return (
            <div key={m.key} className="flex flex-col items-center justify-end h-full">
              <div className="w-full flex flex-col-reverse items-center gap-0.5 group cursor-pointer relative">
                {/* Tooltip flotante al hover */}
                {m.ganancia > 0 && (
                  <div className="absolute -top-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 whitespace-nowrap bg-zinc-950 border border-zinc-700 rounded-md px-2 py-1 text-[9px] text-cyan-200 font-bold tabular-nums">
                    {formatMoney(m.ganancia, 'MXN')}
                  </div>
                )}
                {/* Barra */}
                <div
                  className={`w-full rounded-t-sm transition-all ${
                    esActual
                      ? 'bg-gradient-to-t from-cyan-500 to-emerald-400 shadow-lg shadow-cyan-500/30'
                      : m.ganancia > 0
                        ? 'bg-gradient-to-t from-cyan-700 to-cyan-500/70 group-hover:from-cyan-600 group-hover:to-emerald-500'
                        : 'bg-zinc-800'
                  }`}
                  style={{ height: m.ganancia > 0 ? `${Math.max(2, heightPct)}%` : '4px' }}
                />
              </div>
              <p className={`text-[9px] mt-1 ${esActual ? 'text-cyan-300 font-bold' : 'text-zinc-500'}`}>
                {m.label}
              </p>
            </div>
          )
        })}
      </div>
      {/* Leyenda inferior con cifras compactas */}
      <div className="flex items-center justify-between text-[9px] text-zinc-500 border-t border-zinc-800 pt-2">
        <span>Mes con mayor ganancia: <span className="text-emerald-300 font-bold">{formatMoney(max, 'MXN')}</span></span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-cyan-500"></span>
            Mes previo
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-400"></span>
            Actual
          </span>
        </span>
      </div>
    </div>
  )
}
