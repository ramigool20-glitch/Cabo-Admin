'use client'

import { useState, useTransition } from 'react'
import { Loader2, Pencil, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from '@/components/ui/toast'
import { guardarRateManual, refrescarRateAPI } from '@/app/(app)/fx/actions'

export function FxOverrideForm({ rateActual, fecha }: { rateActual: number | null; fecha: string }) {
  const [valor, setValor] = useState(rateActual ? String(rateActual) : '')
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const guardar = () => {
    const n = Number(valor.replace(',', '.'))
    if (!n || n <= 0 || n > 100) {
      toast.error('Rate inválido', 'Debe ser un número entre 0 y 100')
      return
    }
    startTransition(async () => {
      const res = await guardarRateManual(fecha, n)
      if (res.ok) {
        toast.success('Rate guardado', `${fecha}: $${n.toFixed(2)} MXN`)
        router.refresh()
      } else {
        toast.error('No se pudo guardar', res.error || '')
      }
    })
  }

  const refrescar = () => {
    startTransition(async () => {
      const res = await refrescarRateAPI()
      if (res.ok && res.rate) {
        setValor(String(res.rate))
        toast.success('Rate actualizado', `Desde ${res.source}`)
        router.refresh()
      } else {
        toast.error('No se pudo obtener', res.error || 'Inténtalo después')
      }
    })
  }

  return (
    <div className="card p-3 space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="ej: 17.25"
          className="input-base flex-1 h-10 text-lg font-bold tabular-nums"
        />
        <button
          type="button"
          onClick={guardar}
          disabled={pending}
          className="btn-primary h-10 px-4 text-xs"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pencil className="h-3 w-3" />}
          Guardar
        </button>
      </div>
      <button
        type="button"
        onClick={refrescar}
        disabled={pending}
        className="w-full h-9 rounded-lg border border-cyan-500/30 text-cyan-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
        Re-fetch desde Google
      </button>
    </div>
  )
}
