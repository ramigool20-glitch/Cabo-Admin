'use client'

import { useState } from 'react'
import { Loader2, Wand2 } from 'lucide-react'
import { toast } from '@/components/ui/toast'

export function BackfillFxButton() {
  const [pending, setPending] = useState(false)

  const correr = async () => {
    setPending(true)
    try {
      const res = await fetch('/api/admin/backfill-fx', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Falló el backfill', data.error || 'Inténtalo otra vez')
        return
      }
      if (data.procesadas === 0) {
        toast.info('Todo al día', 'No había transacciones pendientes de conversión')
      } else {
        toast.success(`${data.procesadas} transacciones recalculadas`, data.fallidas ? `${data.fallidas} fallaron` : 'Dashboard ya muestra montos reales')
      }
    } catch (e) {
      toast.error('Error de red', e instanceof Error ? e.message : 'Inténtalo otra vez')
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={correr}
      disabled={pending}
      className="card flex items-center gap-3 w-full p-3 hover:bg-[var(--bg-card-hover)] disabled:opacity-50 transition-colors text-left"
    >
      <Wand2 className="h-5 w-5 text-purple-400 shrink-0" />
      <div className="flex-1 leading-tight">
        <p className="text-sm font-medium text-white">Recalcular conversión MXN</p>
        <p className="text-[11px] text-zinc-500">Aplica el tipo de cambio del día de cada transacción USD anterior</p>
      </div>
      {pending && <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />}
    </button>
  )
}
