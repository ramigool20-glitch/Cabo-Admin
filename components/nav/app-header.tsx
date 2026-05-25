'use client'

import { useState } from 'react'
import { Menu, Bell } from 'lucide-react'
import { SideDrawer } from './side-drawer'

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

          {/* Logo + título */}
          <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 text-xl shrink-0 shadow-lg shadow-emerald-500/20">
              🌊
            </div>
            <h1 className="text-lg font-black heading-gradient leading-none truncate">
              Cabo Admin
            </h1>
          </div>

          {/* User chip + bell */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-bold">
              <span>👑</span>
              <span className="max-w-[80px] truncate">{nombre}</span>
            </div>
            <button
              type="button"
              aria-label="Notificaciones"
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)] text-cyan-300"
            >
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <SideDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} nombre={nombre} />
    </>
  )
}
