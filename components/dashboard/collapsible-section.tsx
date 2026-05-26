'use client'

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function CollapsibleSection({
  id,
  title,
  emoji,
  badge,
  badgeColor = 'bg-cyan-500/20 text-cyan-300',
  defaultOpen = true,
  children,
}: {
  id: string
  title: string
  emoji?: string
  badge?: string | number
  badgeColor?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const storageKey = `dash-section-${id}`
  const [open, setOpen] = useState(defaultOpen)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored !== null) setOpen(stored === '1')
    setHydrated(true)
  }, [storageKey])

  useEffect(() => {
    if (hydrated) localStorage.setItem(storageKey, open ? '1' : '0')
  }, [open, hydrated, storageKey])

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 py-1 group"
      >
        <div className="flex items-center gap-2">
          {emoji && <span className="text-base">{emoji}</span>}
          <span className="text-sm font-bold uppercase tracking-wider text-zinc-300 group-hover:text-cyan-300 transition-colors">
            {title}
          </span>
          {badge !== undefined && badge !== '' && badge !== 0 && (
            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', badgeColor)}>
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-zinc-500 transition-transform duration-200',
            open ? 'rotate-0' : '-rotate-90'
          )}
        />
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          open ? 'opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
        )}
      >
        <div className="space-y-4 pt-1">{children}</div>
      </div>
    </section>
  )
}
