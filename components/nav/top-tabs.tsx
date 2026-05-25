'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/dashboard',     emoji: '🏠', label: 'Dashboard' },
  { href: '/chat',          emoji: '💬', label: 'Captura IA' },
  { href: '/cobros',        emoji: '💳', label: 'Cobros' },
  { href: '/transacciones', emoji: '📋', label: 'Transacciones' },
  { href: '/negocios',      emoji: '🏢', label: 'Negocios' },
  { href: '/tareas',        emoji: '✅', label: 'Tareas' },
  { href: '/auditor',       emoji: '🤖', label: 'Auditor' },
]

export function TopTabs() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-14 z-20 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/95 backdrop-blur-xl">
      <ul className="flex overflow-x-auto scrollbar-none">
        {TABS.map((t) => {
          const active = pathname === t.href || (t.href !== '/' && pathname.startsWith(t.href))
          return (
            <li key={t.href} className="shrink-0">
              <Link
                href={t.href}
                className={cn(
                  'inline-flex items-center gap-1.5 px-4 h-12 text-sm font-medium border-b-2 transition-colors',
                  active
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                )}
              >
                <span className="text-base">{t.emoji}</span>
                <span>{t.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
