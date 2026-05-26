'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'success' | 'error' | 'info' | 'warning'

type ToastItem = {
  id: number
  variant: ToastVariant
  title: string
  description?: string
  duration: number
}

type ToastInput = {
  variant?: ToastVariant
  title: string
  description?: string
  duration?: number
}

const EVENT_NAME = 'cabo:toast'

export function toast(input: ToastInput) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: input }))
}

toast.success = (title: string, description?: string) =>
  toast({ variant: 'success', title, description })

toast.error = (title: string, description?: string) =>
  toast({ variant: 'error', title, description })

toast.info = (title: string, description?: string) =>
  toast({ variant: 'info', title, description })

toast.warning = (title: string, description?: string) =>
  toast({ variant: 'warning', title, description })

const VARIANT_STYLES: Record<ToastVariant, { icon: typeof CheckCircle2; ring: string; iconColor: string }> = {
  success: { icon: CheckCircle2, ring: 'ring-emerald-400/40 bg-emerald-500/10', iconColor: 'text-emerald-400' },
  error:   { icon: AlertCircle,  ring: 'ring-rose-400/40 bg-rose-500/10',       iconColor: 'text-rose-400' },
  info:    { icon: Info,         ring: 'ring-cyan-400/40 bg-cyan-500/10',       iconColor: 'text-cyan-400' },
  warning: { icon: AlertTriangle,ring: 'ring-amber-400/40 bg-amber-500/10',     iconColor: 'text-amber-400' },
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    let nextId = 1
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastInput>).detail
      const item: ToastItem = {
        id: nextId++,
        variant: detail.variant ?? 'info',
        title: detail.title,
        description: detail.description,
        duration: detail.duration ?? 3500,
      }
      setItems((curr) => [...curr, item])
      // auto-dismiss
      setTimeout(() => {
        setItems((curr) => curr.filter((t) => t.id !== item.id))
      }, item.duration)
      // haptic feedback en iOS PWA
      if ('vibrate' in navigator) {
        try { navigator.vibrate(item.variant === 'error' ? [40, 30, 40] : 25) } catch {}
      }
    }
    window.addEventListener(EVENT_NAME, onToast)
    return () => window.removeEventListener(EVENT_NAME, onToast)
  }, [])

  const dismiss = (id: number) => setItems((curr) => curr.filter((t) => t.id !== id))

  return (
    <div
      className="fixed z-[100] left-0 right-0 bottom-0 flex flex-col items-center gap-2 px-3 pb-4 pointer-events-none"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
      aria-live="polite"
      aria-atomic="true"
    >
      {items.map((item) => {
        const v = VARIANT_STYLES[item.variant]
        const Icon = v.icon
        return (
          <div
            key={item.id}
            role="status"
            className={cn(
              'pointer-events-auto w-full max-w-sm rounded-xl backdrop-blur-xl shadow-2xl ring-1',
              'bg-[var(--bg-card)]/95 border border-[var(--border-subtle)]',
              v.ring,
              'animate-toast-in'
            )}
          >
            <div className="flex items-start gap-3 p-3">
              <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', v.iconColor)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-tight">{item.title}</p>
                {item.description && (
                  <p className="text-xs text-zinc-400 mt-0.5 leading-snug">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Cerrar"
                className="h-6 w-6 inline-flex items-center justify-center rounded text-zinc-500 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
