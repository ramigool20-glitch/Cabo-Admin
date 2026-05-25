'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MessageCircle,
  LayoutDashboard,
  Building2,
  CheckSquare,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const items = [
  { href: '/chat',      label: 'Chat',     icon: MessageCircle },
  { href: '/dashboard', label: 'Dash',     icon: LayoutDashboard },
  { href: '/negocios',  label: 'Negocios', icon: Building2 },
  { href: '/tareas',    label: 'Tareas',   icon: CheckSquare },
  { href: '/mas',       label: 'Más',      icon: MoreHorizontal },
]

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex h-16 items-stretch justify-around">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  'flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  active
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
