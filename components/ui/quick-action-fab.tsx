'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Plus, X, MessageCircle, Receipt, CreditCard, Calendar, CheckSquare, PartyPopper, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const ACCIONES = [
  { href: '/chat',              label: 'Captura IA',     icon: MessageCircle, color: 'from-cyan-500 to-blue-500' },
  { href: '/transacciones/nueva', label: 'Transacción',  icon: Receipt,        color: 'from-emerald-500 to-teal-500' },
  { href: '/cobros',            label: 'Cobro Stripe',   icon: CreditCard,     color: 'from-purple-500 to-pink-500' },
  { href: '/tareas/nueva',      label: 'Tarea',          icon: CheckSquare,    color: 'from-amber-500 to-orange-500' },
  { href: '/eventos/nuevo',     label: 'Evento',         icon: PartyPopper,    color: 'from-pink-500 to-rose-500' },
  { href: '/recurrentes/nuevo', label: 'Gasto fijo',     icon: Calendar,       color: 'from-blue-500 to-indigo-500' },
  { href: '/por-pagar/nueva',   label: 'Por pagar',      icon: AlertCircle,    color: 'from-red-500 to-rose-500' },
]

export function QuickActionFab() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        />
      )}

      {/* Acciones expandidas */}
      <div
        className={cn(
          'fixed right-4 z-50 flex flex-col-reverse items-end gap-3 transition-all',
          open ? 'pointer-events-auto' : 'pointer-events-none'
        )}
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}
      >
        {ACCIONES.map((a, i) => (
          <Link
            key={a.href}
            href={a.href}
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-3 transition-all duration-200',
              open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            )}
            style={{ transitionDelay: open ? `${i * 30}ms` : '0ms' }}
          >
            <span className="bg-[var(--bg-card)] border border-[var(--border-subtle)] px-3 py-1.5 rounded-full text-xs font-bold text-white shadow-lg whitespace-nowrap">
              {a.label}
            </span>
            <span className={cn(
              'h-11 w-11 inline-flex items-center justify-center rounded-full bg-gradient-to-br text-white shadow-lg',
              a.color
            )}>
              <a.icon className="h-5 w-5" />
            </span>
          </Link>
        ))}
      </div>

      {/* Botón principal */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar acciones' : 'Acción rápida'}
        className={cn(
          'fixed right-4 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-all',
          open
            ? 'bg-rose-500 shadow-rose-500/40 rotate-45'
            : 'bg-gradient-to-br from-cyan-500 to-blue-500 shadow-cyan-500/40 hover:scale-105 active:scale-95'
        )}
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
      >
        {open ? <X className="h-7 w-7" strokeWidth={2.5} /> : <Plus className="h-7 w-7" strokeWidth={2.5} />}
      </button>
    </>
  )
}
