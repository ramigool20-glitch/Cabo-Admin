'use client'

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatearFecha } from '@/lib/fechas'

export type PuntoUtilidad = { fecha: string; ingresos: number; gastos: number; utilidad: number }

export function UtilidadChart({ data }: { data: PuntoUtilidad[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-8 text-center text-sm text-zinc-500">
        Sin movimientos en el rango seleccionado.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
        Utilidad por día (MXN)
      </p>
      <div className="h-48 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="grad-util" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.4} />
            <XAxis
              dataKey="fecha"
              tickFormatter={(f) => formatearFecha(f, 'dd MMM')}
              tick={{ fontSize: 10, fill: '#71717a' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              tick={{ fontSize: 10, fill: '#71717a' }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid #e4e4e7',
                background: '#fff',
              }}
              labelFormatter={(f) => formatearFecha(f, 'EEEE dd MMM')}
              formatter={(v, name) => [
                `$${Number(v ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}`,
                String(name ?? ''),
              ]}
            />
            <Area
              type="monotone"
              dataKey="utilidad"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#grad-util)"
              name="Utilidad"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
