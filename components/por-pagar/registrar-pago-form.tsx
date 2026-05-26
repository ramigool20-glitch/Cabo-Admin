'use client'

import { useActionState } from 'react'
import { Loader2, Check } from 'lucide-react'
import { registrarPago, type ActionState } from '@/app/(app)/por-pagar/actions'
import { hoyEnCabos } from '@/lib/fechas'

type Cuenta = { id: string; nombre: string; moneda: string }

export function RegistrarPagoForm({
  cuentaId,
  restante,
  moneda,
  cuentas,
}: {
  cuentaId: string
  restante: number
  moneda: 'MXN' | 'USD'
  cuentas: Cuenta[]
}) {
  const action = registrarPago.bind(null, cuentaId)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {})

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="fecha_pago" className="label-caps">Fecha</label>
          <input id="fecha_pago" name="fecha_pago" type="date" required defaultValue={hoyEnCabos()} className="input-base w-full h-10 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="monto" className="label-caps">Monto {moneda}</label>
          <input
            id="monto"
            name="monto"
            type="text"
            inputMode="decimal"
            required
            defaultValue={restante.toString()}
            placeholder={restante.toFixed(2)}
            className="input-base w-full h-10 text-sm font-bold tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="cuenta_origen_id" className="label-caps">Pagado desde</label>
        <select id="cuenta_origen_id" name="cuenta_origen_id" className="input-base w-full h-10 text-sm">
          <option value="">— Sin cuenta</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="metodo_pago" className="label-caps">Método</label>
        <select id="metodo_pago" name="metodo_pago" className="input-base w-full h-10 text-sm">
          <option value="">— Sin especificar</option>
          <option value="transferencia_bancaria">Transferencia</option>
          <option value="efectivo_mxn">Efectivo MXN</option>
          <option value="efectivo_usd">Efectivo USD</option>
          <option value="mp_transferencia">MP Transferencia</option>
          <option value="stripe">Stripe</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="otro">Otro</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notas" className="label-caps">Notas</label>
        <input id="notas" name="notas" type="text" placeholder="opcional" className="input-base w-full h-10 text-sm" />
      </div>

      {state.error && <p className="text-xs text-rose-400">{state.error}</p>}
      {state.ok && <p className="text-xs text-emerald-400 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Pago registrado</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full h-10 text-sm">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Registrar pago
      </button>
    </form>
  )
}
