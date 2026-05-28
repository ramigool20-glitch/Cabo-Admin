'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Home, PlusCircle, ClipboardList, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

type Item = {
  label: string
  href: string
  icon: typeof Home
  isActive: (pathname: string, tab: string) => boolean
}

const ITEMS: Item[] = [
  { label: 'Inicio', href: '/clinica?tab=inicio', icon: Home, isActive: (p, t) => p === '/clinica' && t === 'inicio' },
  { label: 'Registrar', href: '/clinica?tab=registrar', icon: PlusCircle, isActive: (p, t) => p === '/clinica' && t === 'registrar' },
  { label: 'Catálogo', href: '/clinica?tab=catalogo', icon: ClipboardList, isActive: (p, t) => p === '/clinica' && t === 'catalogo' },
  { label: 'Tareas', href: '/tareas', icon: CheckSquare, isActive: (p) => p.startsWith('/tareas') },
]

export function NurseBottomNav() {
  const pathname = usePathname()
  const sp = useSearchParams()
  const tab = sp.get('tab') ?? 'inicio'

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]/95 backdrop-blur-lg">
      <div className="max-w-3xl mx-auto grid grid-cols-4">
        {ITEMS.map((it) => {
          const active = it.isActive(pathname, tab)
          const Icon = it.icon
          return (
            <Link
              key={it.label}
              href={it.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-bold tracking-wide transition-colors',
                active ? 'text-cyan-400' : 'text-zinc-500 hover:text-zinc-300',
              )}
            >
              <Icon className={cn('h-5 w-5', active && 'drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]')} />
              {it.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
