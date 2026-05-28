'use client'

import { useState } from 'react'
import { Loader2, Bell, Brain } from 'lucide-react'
import { toast } from '@/components/ui/toast'

export function DiagnosticoPush() {
  const [pending, setPending] = useState<'push' | 'ia' | null>(null)

  const probarPush = async () => {
    setPending('push')
    try {
      const res = await fetch('/api/admin/push-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mandar_prueba: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Error', data.error || 'Inténtalo de nuevo')
        return
      }
      const ok = (data.suscripciones ?? []).filter((s: { resultado?: string }) => s.resultado?.startsWith('OK')).length
      if (ok > 0) {
        toast.success(`${ok} notificación${ok > 1 ? 'es' : ''} enviada${ok > 1 ? 's' : ''}`, 'Si no llega, revisa permisos del iPhone')
      } else {
        toast.error('No se enviaron', `${data.total_suscripciones ?? 0} suscripciones activas`)
      }
    } finally {
      setPending(null)
    }
  }

  const probarIA = async () => {
    setPending('ia')
    try {
      const res = await fetch('/api/push/test-ia', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        toast.success(`IA generó observación (${data.modelo})`, data.mensaje_ia)
      } else {
        toast.error('Falló IA', data.error)
      }
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={probarPush}
        disabled={pending !== null}
        className="btn-primary h-11 text-sm w-full"
      >
        {pending === 'push' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
        Probar notificación
      </button>

      <button
        type="button"
        onClick={probarIA}
        disabled={pending !== null}
        className="h-11 text-sm w-full rounded-md border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 font-bold hover:bg-cyan-500/20 inline-flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {pending === 'ia' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
        Probar IA (analiza y manda observación)
      </button>

      <p className="text-[10px] text-zinc-500 px-1 leading-snug">
        El sistema manda observaciones automáticas 2× al día (10am y 6pm) analizando tu data. Estos botones son solo para probar que llegan.
      </p>
    </div>
  )
}
