'use client'

import { useActionState, useEffect } from 'react'
import { Loader2, Check } from 'lucide-react'
import { registrarPagoEvento, type ActionState } from '@/app/(app)/eventos/actions'
import { hoyEnCabos } from '@/lib/fechas'
import { toast } from '@/components/ui/toast'
import { useRouter } from 'next/navigation'

type Cuenta = { id: string; nombre: string; moneda: string }

export function PagoEventoForm({
  eventoId,
  moneda,
  pendiente,
  cuentas,
}: {
  eventoId: string
  moneda: 'MXN' | 'USD'
  pendiente: number
  cuentas: Cuenta[]
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(registrarPagoEvento, {})
  const router = useRouter()

  useEffect(() => {
    if (state.ok) {
      toast.success('Pago registrado', 'Ingreso creado y aplicado al evento')
      router.refresh()
    } else if (state.error) {
      toast.error('No se pudo registrar', state.error)
    }
  }, [state, router])

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="evento_id" value={eventoId} />
      <input type="hidden" name="moneda" value={moneda} />

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="fecha_pago" className="label-caps">Fecha</label>
          <input
            id="fecha_pago"
            name="fecha_pago"
            type="date"
            required
            defaultValue={hoyEnCabos()}
            className="input-base w-full h-10 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="monto" className="label-caps">Monto</label>
          <input
            id="monto"
            name="monto"
            type="text"
            inputMode="decimal"
            required
            defaultValue={pendiente > 0 ? pendiente.toFixed(2) : ''}
            placeholder={pendiente.toFixed(2)}
            className="input-base w-full h-10 text-sm font-bold tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="concepto" className="label-caps">Concepto</label>
        <input
          id="concepto"
          name="concepto"
          type="text"
          defaultValue={pendiente > 0 ? 'Pago final' : ''}
          placeholder="Anticipo, segundo pago, pago final…"
          className="input-base w-full h-10 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="cuenta_id" className="label-caps">Cuenta donde entró</label>
        <select id="cuenta_id" name="cuenta_id" className="input-base w-full h-10 text-sm">
          <option value="">— Sin cuenta</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
        </select>
      </div>

      {state.error && <p className="text-xs text-rose-400">{state.error}</p>}
      {state.ok && (
        <p className="text-xs text-emerald-400 inline-flex items-center gap-1">
          <Check className="h-3 w-3" /> Pago registrado
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full h-10 text-sm">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Registrar
      </button>
    </form>
  )
}
