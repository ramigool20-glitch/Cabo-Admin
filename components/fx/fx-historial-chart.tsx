'use client'

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatearFecha } from '@/lib/fechas'

type Punto = { fecha: string; rate: number }

export function FxHistorialChart({ data }: { data: Punto[] }) {
  if (data.length === 0) {
    return (
      <div className="card border-dashed p-8 text-center text-sm text-zinc-500">
        Sin historial todavía. Se acumula a partir de hoy.
      </div>
    )
  }

  return (
    <div className="card p-3">
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="fxFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1a2348" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="fecha"
            tick={{ fill: '#6b7596', fontSize: 9 }}
            tickFormatter={(d) => formatearFecha(d, 'dd/MM')}
            stroke="#1a2348"
          />
          <YAxis
            tick={{ fill: '#6b7596', fontSize: 9 }}
            stroke="#1a2348"
            domain={['dataMin - 0.3', 'dataMax + 0.3']}
            tickFormatter={(v) => `$${v.toFixed(1)}`}
          />
          <Tooltip
            contentStyle={{
              background: '#0a1129',
              border: '1px solid #2d3a6e',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: '#a8b3d1' }}
            labelFormatter={(d) => formatearFecha(d as string, 'EEEE dd MMM')}
            formatter={(v) => [`$${Number(v).toFixed(4)} MXN`, 'USD']}
          />
          <Area type="monotone" dataKey="rate" stroke="#06b6d4" fill="url(#fxFill)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
