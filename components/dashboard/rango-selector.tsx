'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { RANGOS, type RangoId } from '@/lib/rangos'
import { cn } from '@/lib/utils'

export function RangoSelector({
  actual,
  customDesde,
  customHasta,
}: {
  actual: RangoId
  customDesde?: string
  customHasta?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [showCustom, setShowCustom] = useState(actual === 'custom')
  const [desde, setDesde] = useState<string>(customDesde ?? '')
  const [hasta, setHasta] = useState<string>(customHasta ?? '')

  const aplicar = (id: RangoId, d?: string, h?: string) => {
    const params = new URLSearchParams(sp.toString())
    params.set('rango', id)
    if (id === 'custom' && d && h) {
      params.set('desde', d)
      params.set('hasta', h)
    } else {
      params.delete('desde')
      params.delete('hasta')
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleSelect = (id: RangoId) => {
    if (id === 'custom') {
      setShowCustom(true)
    } else {
      setShowCustom(false)
      aplicar(id)
    }
  }

  const aplicarCustom = () => {
    if (desde && hasta) {
      aplicar('custom', desde, hasta)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {RANGOS.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => handleSelect(r.id)}
            className={cn(
              'h-8 px-3 rounded-full text-xs font-medium border shrink-0 transition-colors',
              actual === r.id
                ? 'border-cyan-500 bg-cyan-500 text-white'
                : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-zinc-400 hover:text-zinc-200'
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {showCustom && (
        <div className="card p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="custom_desde" className="label-caps mb-1">Desde</label>
              <input
                id="custom_desde"
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="input-base w-full h-10 text-sm"
              />
            </div>
            <div>
              <label htmlFor="custom_hasta" className="label-caps mb-1">Hasta</label>
              <input
                id="custom_hasta"
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="input-base w-full h-10 text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={aplicarCustom}
            disabled={!desde || !hasta}
            className="btn-primary w-full h-9 text-xs"
          >
            Aplicar rango
          </button>
        </div>
      )}
    </div>
  )
}
