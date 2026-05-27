'use client'

import { useActionState, useState, useEffect } from 'react'
import { Plus, X, Loader2, Save } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { agregarCuenta, type ActionState } from '@/app/(app)/cashflow/actions'

export function NuevaCuentaForm() {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(agregarCuenta, {})

  useEffect(() => {
    if (state.ok) {
      toast.success('Cuenta agregada', 'Ahora captura su saldo inicial')
      setOpen(false)
    } else if (state.error) {
      toast.error('No se pudo agregar', state.error)
    }
  }, [state])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary h-10 text-sm w-full"
      >
        <Plus className="h-4 w-4" />
        Agregar cuenta
      </button>
    )
  }

  return (
    <form action={formAction} className="card-glow border-cyan-500/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-cyan-300">Nueva cuenta</p>
        <button type="button" onClick={() => setOpen(false)} className="h-7 w-7 text-zinc-500 hover:text-white inline-flex items-center justify-center">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        <label className="label-caps">Nombre</label>
        <input name="nombre" type="text" required placeholder="Cvu Pharmacy Fiscal, BBVA…" className="input-base w-full h-10 text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <label className="label-caps">Tipo</label>
          <select name="tipo" defaultValue="banco" className="input-base w-full h-10 text-sm">
            <option value="banco">🏦 Banco</option>
            <option value="mercado_pago">🛒 Mercado Pago</option>
            <option value="stripe">💳 Stripe</option>
            <option value="efectivo">💵 Efectivo</option>
            <option value="tarjeta">💳 Tarjeta crédito</option>
            <option value="otra">💰 Otra</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="label-caps">Moneda principal</label>
          <select name="moneda" defaultValue="MXN" className="input-base w-full h-10 text-sm">
            <option value="MXN">MXN</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="label-caps">Titular (opcional)</label>
        <input name="titular" type="text" placeholder="Miguel, Sergio, Sociedad…" className="input-base w-full h-10 text-sm" />
      </div>

      <div className="space-y-2">
        <label className="label-caps">Notas (opcional)</label>
        <input name="notas" type="text" placeholder="Detalle adicional…" className="input-base w-full h-10 text-sm" />
      </div>

      {state.error && <p className="text-sm text-rose-400">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full h-10 text-sm">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Crear cuenta
      </button>
    </form>
  )
}
