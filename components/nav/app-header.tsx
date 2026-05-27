'use client'

import { useState } from 'react'
import { Menu, Search } from 'lucide-react'
import Link from 'next/link'
import { SideDrawer } from './side-drawer'
import { CaboLogo, CaboWordmark } from '@/components/ui/cabo-logo'
import { FxPill } from '@/components/fx/fx-pill'

export function AppHeader({ nombre }: { nombre: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <header
        className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/95 backdrop-blur-xl"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center justify-between gap-2 h-14 px-3">
          {/* Hamburger */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menú"
            className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-cyan-300 hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Logo + wordmark + FX pill */}
          <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
            <CaboLogo size={32} className="shrink-0 shadow-lg shadow-emerald-500/30 rounded-lg" />
            <CaboWordmark size="md" />
            <FxPill />
          </div>

          {/* Buscar */}
          <div className="flex items-center gap-2">
            <Link
              href="/buscar"
              aria-label="Buscar"
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-cyan-300"
            >
              <Search className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} nombre={nombre} />
    </>
  )
}
