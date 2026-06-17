'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  X,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  Building2,
  CheckSquare,
  AlertTriangle,
  Calendar,
  Users,
  Sparkles,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/(auth)/login/actions'
import { CaboLogo, CaboWordmark } from '@/components/ui/cabo-logo'

const HERRAMIENTAS = [
  { href: '/dashboard',     label: 'Dashboard',   icon: LayoutDashboard, emoji: '🏠' },
  { href: '/cashflow',      label: 'Cash Flow',   icon: LayoutDashboard, emoji: '💰' },
  { href: '/calendario',    label: 'Calendario',  icon: Calendar,        emoji: '🗓️' },
  { href: '/buscar',        label: 'Buscar',      icon: LayoutDashboard, emoji: '🔍' },
  { href: '/fx',            label: 'USD / MXN',   icon: LayoutDashboard, emoji: '💵' },
  { href: '/chat',          label: 'Captura IA',  icon: MessageCircle,   emoji: '💬', badge: 'IA' },
  { href: '/cobros',        label: 'Cobros Stripe', icon: Receipt,       emoji: '💳' },
  { href: '/transacciones', label: 'Transacciones', icon: Receipt,       emoji: '📋' },
  { href: '/transacciones/venta', label: 'Registrar Venta', icon: Receipt, emoji: '🛒' },
  { href: '/pos',           label: 'POS Cvu',     icon: Receipt,        emoji: '💊' },
  { href: '/cotizaciones',  label: 'Cotizaciones', icon: Receipt,        emoji: '📄' },
  { href: '/reportes/ganancia', label: 'Reportes Ganancia', icon: Sparkles, emoji: '📈' },
  { href: '/negocios',      label: 'Negocios',    icon: Building2,       emoji: '🏢' },
  { href: '/casa',          label: 'Casa',        icon: Building2,       emoji: '🏠' },
  { href: '/tareas',        label: 'Tareas',      icon: CheckSquare,     emoji: '✅' },
  { href: '/multas',        label: 'Multas',      icon: AlertTriangle,   emoji: '⚠️' },
  { href: '/eventos',       label: 'Eventos',     icon: Calendar,        emoji: '🎉' },
  { href: '/clinica',       label: 'Clínica',     icon: Building2,       emoji: '🏥' },
  { href: '/inventario',    label: 'Inventario',  icon: Building2,       emoji: '📦' },
  { href: '/recurrentes',   label: 'Gastos Fijos', icon: Calendar,       emoji: '📅' },
  { href: '/por-pagar',     label: 'Por Pagar',   icon: AlertTriangle,   emoji: '💸' },
  { href: '/por-cobrar',    label: 'Por Cobrar',  icon: AlertTriangle,   emoji: '💰' },
  { href: '/nomina',        label: 'Nómina',      icon: Users,           emoji: '👥' },
  { href: '/auditor',       label: 'Auditor IA',  icon: Sparkles,        emoji: '🤖' },
  { href: '/radar',         label: 'Radar',       icon: Sparkles,        emoji: '🛰️' },
  { href: '/inteligencia',  label: 'Inteligencia SEO', icon: Sparkles,   emoji: '🕵️' },
  { href: '/historial',     label: 'Historial',   icon: LayoutDashboard, emoji: '📜' },
  { href: '/config',        label: 'Configuración', icon: Settings,      emoji: '⚙️' },
]

export function SideDrawer({ open, onClose, nombre }: { open: boolean; onClose: () => void; nombre: string }) {
  const pathname = usePathname()

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    // Cerrar al cambiar de ruta
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
      />

      {/* Drawer */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-72 bg-[var(--bg-base)] border-r border-[var(--border-subtle)]',
          'transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Header del drawer */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2.5">
            <CaboLogo size={36} className="shadow-lg shadow-emerald-500/30 rounded-lg" />
            <div className="leading-tight">
              <CaboWordmark size="md" />
              <p className="text-[10px] text-cyan-300/50 mt-0.5">Sistema de gestión</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar menú" className="h-8 w-8 inline-flex items-center justify-center text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Lista de herramientas */}
        <nav className="overflow-y-auto h-[calc(100%-8rem)] py-3">
          <p className="label-caps px-4 mb-2">Herramientas</p>
          <ul>
            {HERRAMIENTAS.map((item) => {
              const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 text-sm transition-colors',
                      active
                        ? 'bg-cyan-500/10 text-cyan-300 border-l-2 border-cyan-400'
                        : 'text-zinc-400 hover:bg-white/5 hover:text-white border-l-2 border-transparent'
                    )}
                  >
                    <span className="text-base">{item.emoji}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Logout en bottom */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-[var(--border-subtle)] p-3">
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
