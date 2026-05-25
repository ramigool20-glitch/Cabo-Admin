'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { RANGOS, type RangoId } from '@/lib/rangos'
import { cn } from '@/lib/utils'

export function RangoSelector({ actual }: { actual: RangoId }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const select = (id: RangoId) => {
    const params = new URLSearchParams(sp.toString())
    params.set('rango', id)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
      {RANGOS.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => select(r.id)}
          className={cn(
            'h-8 px-3 rounded-full text-xs font-medium border shrink-0 transition-colors',
            actual === r.id
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-zinc-400'
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}
