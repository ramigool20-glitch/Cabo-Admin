'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DollarSign, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

type FxData = {
  rate: {
    fecha: string
    rate_compra: number
    rate_venta: number | null
    mid_rate: number | null
    manual: boolean
  }
  variacion?: number
}

export function FxPill() {
  const [data, setData] = useState<FxData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/fx/now', { cache: 'no-store' })
        if (!res.ok) {
          if (!cancelled) setError(true)
          return
        }
        const json = await res.json()
        if (!cancelled) {
          if (json.ok) {
            setData(json)
            setError(false)
          } else {
            setError(true)
          }
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const t = setInterval(load, 10 * 60 * 1000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  if (loading) {
    return (
      <div className="h-10 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-zinc-500">
        <DollarSign className="h-3.5 w-3.5" />
        <span className="text-[10px] font-mono">…</span>
      </div>
    )
  }

  // Error o sin data → pill clickeable que lleva a /fx para capturar manual
  if (error || !data) {
    return (
      <Link
        href="/fx"
        aria-label="Capturar tipo de cambio"
        className="h-10 px-2.5 inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300"
      >
        <DollarSign className="h-3 w-3 opacity-70" />
        <span className="text-[10px] font-bold leading-none">FX?</span>
      </Link>
    )
  }

  const variacion = data.variacion ?? 0
  const TrendIcon = variacion > 0.01 ? TrendingUp : variacion < -0.01 ? TrendingDown : Minus
  const colorClass =
    variacion > 0.01 ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
      : variacion < -0.01 ? 'text-rose-300 border-rose-500/40 bg-rose-500/10'
      : 'text-cyan-300 border-cyan-500/40 bg-cyan-500/10'

  return (
    <Link
      href="/fx"
      aria-label="Tipo de cambio del día"
      className={cn(
        'h-10 px-2.5 inline-flex items-center gap-1 rounded-lg border transition-colors',
        colorClass,
        'hover:opacity-90'
      )}
    >
      <DollarSign className="h-3 w-3 opacity-70" />
      <span className="text-xs font-bold tabular-nums leading-none">
        {data.rate.rate_compra.toFixed(2)}
      </span>
      <TrendIcon className="h-3 w-3 opacity-70" />
    </Link>
  )
}
