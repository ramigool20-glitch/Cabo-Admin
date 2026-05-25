'use client'

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'

export type PuntoNegocio = { nombre: string; ingresos: number; gastos: number }

export function NegociosBar({ data }: { data: PuntoNegocio[] }) {
  if (data.length === 0) return null

  return (
    <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
        Por negocio (MXN)
      </p>
      <div className="h-64 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" strokeOpacity={0.4} />
            <XAxis
              dataKey="nombre"
              tick={{ fontSize: 9, fill: '#71717a' }}
              tickLine={false}
              axisLine={false}
              interval={0}
              angle={-30}
              textAnchor="end"
              height={60}
            />
            <YAxis
              tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
              tick={{ fontSize: 10, fill: '#71717a' }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid #e4e4e7',
                background: '#fff',
              }}
              formatter={(v, name) => [
                `$${Number(v ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}`,
                String(name ?? ''),
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="ingresos" fill="#10b981" name="Ingresos" radius={[4, 4, 0, 0]} />
            <Bar dataKey="gastos"   fill="#ef4444" name="Gastos"   radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
