'use client'

import { useActionState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { marcarPagado, type ActionState } from '@/app/(app)/recurrentes/actions'
import { hoyEnCabos } from '@/lib/fechas'

export function MarcarPagadoForm({
  recurrenteId,
  monto,
  comprobanteRequerido,
}: {
  recurrenteId: string
  monto: number
  comprobanteRequerido: boolean
}) {
  const action = marcarPagado.bind(null, recurrenteId)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {})

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="fecha_pago" className="text-sm font-medium">Fecha de pago</label>
        <input
          id="fecha_pago"
          name="fecha_pago"
          type="date"
          defaultValue={hoyEnCabos()}
          required
          className="w-full h-12 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="monto_pagado" className="text-sm font-medium">Monto pagado</label>
        <input
          id="monto_pagado"
          name="monto_pagado"
          type="text"
          inputMode="decimal"
          defaultValue={String(monto)}
          required
          className="w-full h-12 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="comprobante" className="text-sm font-medium">
          Comprobante {comprobanteRequerido ? '(requerido)' : '(opcional)'}
        </label>
        <input
          id="comprobante"
          name="comprobante"
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          required={comprobanteRequerido}
          className="w-full text-sm file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 dark:file:bg-emerald-950 dark:file:text-emerald-400 cursor-pointer"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {pending ? 'Guardando' : 'Marcar pagado'}
      </button>
    </form>
  )
}
