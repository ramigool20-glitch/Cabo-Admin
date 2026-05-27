'use client'

import Link from 'next/link'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { DollarSign, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

type Punto = { fecha: string; rate_compra: number }

export function FxMiniWidget({
  rateHoy,
  historial,
}: {
  rateHoy: { rate_compra: number; manual?: boolean } | null
  historial: Punto[]
}) {
  if (!rateHoy || historial.length === 0) return null

  const data = [...historial]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((h) => ({ fecha: h.fecha, rate: Number(h.rate_compra) }))

  const primer = data[0]?.rate ?? rateHoy.rate_compra
  const ultimo = rateHoy.rate_compra
  const variacion = ultimo - primer
  const TrendIcon = variacion > 0.01 ? TrendingUp : variacion < -0.01 ? TrendingDown : Minus
  const trendColor =
    variacion > 0.01 ? 'text-emerald-400' : variacion < -0.01 ? 'text-rose-400' : 'text-zinc-400'

  return (
    <Link href="/fx" className="card flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)] transition-colors">
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-cyan-400" />
        <div className="leading-tight">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">USD/MXN</p>
          <p className="text-lg font-black tabular-nums text-cyan-300">${ultimo.toFixed(2)}</p>
        </div>
      </div>
      <div className="flex-1 h-10">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="fxMiniFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="rate" stroke="#06b6d4" fill="url(#fxMiniFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className={cn('inline-flex items-center gap-1 text-xs font-bold tabular-nums shrink-0', trendColor)}>
        <TrendIcon className="h-3 w-3" />
        {variacion > 0 ? '+' : ''}{variacion.toFixed(2)}
      </div>
    </Link>
  )
}
