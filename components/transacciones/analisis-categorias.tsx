'use client'

import { useState } from 'react'
import { BarChart3, ChevronDown, Sparkles } from 'lucide-react'
import { formatMoney, cn } from '@/lib/utils'
import type { DesgloseCat } from '@/lib/categorias-grupos'

export function AnalisisCategorias({ items, total }: { items: DesgloseCat[]; total: number }) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  const max = items[0]?.monto || 1
  const top = items[0]
  const bottom = items[items.length - 1]

  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 p-3">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
          <BarChart3 className="h-4 w-4" />
        </span>
        <span className="flex-1 text-left">
          <span className="text-sm font-bold text-white">Categorías de gasto</span>
          <span className="ml-1.5 inline-flex items-center gap-0.5 text-[9px] text-cyan-300/70"><Sparkles className="h-2.5 w-2.5" /> IA</span>
        </span>
        <span className="text-[11px] text-zinc-500 tabular-nums">{items.length} · {formatMoney(total, 'MXN')}</span>
        <ChevronDown className={cn('h-4 w-4 text-zinc-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {/* Destacados */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2">
              <p className="text-[9px] uppercase tracking-wider text-zinc-500">🔥 Más gastas</p>
              <p className="text-xs font-bold text-white truncate">{top.emoji} {top.label}</p>
              <p className="text-sm font-black tabular-nums text-rose-300">{formatMoney(top.monto, 'MXN')}</p>
            </div>
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2">
              <p className="text-[9px] uppercase tracking-wider text-zinc-500">🌱 Menos gastas</p>
              <p className="text-xs font-bold text-white truncate">{bottom.emoji} {bottom.label}</p>
              <p className="text-sm font-black tabular-nums text-emerald-300">{formatMoney(bottom.monto, 'MXN')}</p>
            </div>
          </div>

          {/* Barras por categoría */}
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id}>
                <div className="flex items-center justify-between text-[11px] mb-0.5">
                  <span className="text-zinc-300">{it.emoji} {it.label} <span className="text-zinc-600">· {it.count}</span></span>
                  <span className={cn('tabular-nums font-bold', it.text)}>
                    {formatMoney(it.monto, 'MXN')} <span className="text-zinc-600 font-normal">{it.pct.toFixed(0)}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-black/30 overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', it.color)} style={{ width: `${Math.max(3, (it.monto / max) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
