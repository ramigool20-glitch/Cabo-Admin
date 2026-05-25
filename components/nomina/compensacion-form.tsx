'use client'

import { useActionState, useState } from 'react'
import { addCompensacion, type ActionState } from '@/app/(app)/nomina/actions'
import { cn } from '@/lib/utils'

type Negocio = { id: string; nombre: string }

export function CompensacionForm({
  empleadoId,
  negocios,
}: {
  empleadoId: string
  negocios: Negocio[]
}) {
  const action = addCompensacion.bind(null, empleadoId)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {})
  const [moneda, setMoneda] = useState<'MXN' | 'USD'>('MXN')
  const [frec, setFrec] = useState<'mensual' | 'quincenal' | 'semanal'>('quincenal')

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="negocio_id" className="text-sm font-medium">Negocio</label>
        <select
          id="negocio_id"
          name="negocio_id"
          required
          className="w-full h-12 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-base"
        >
          <option value="">— Selecciona</option>
          {negocios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="sueldo_base" className="text-sm font-medium">Sueldo base</label>
          <input
            id="sueldo_base"
            name="sueldo_base"
            type="text"
            inputMode="decimal"
            required
            defaultValue="0"
            className="w-full h-12 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-base tabular-nums"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Moneda</label>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] h-12">
            <input type="hidden" name="moneda" value={moneda} />
            {(['MXN', 'USD'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMoneda(m)}
                className={cn(
                  'rounded-lg text-sm font-bold transition-colors',
                  moneda === m ? 'bg-[var(--bg-card)] text-white shadow' : 'text-zinc-500'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="comision_porcentaje" className="text-sm font-medium">Comisión %</label>
          <input
            id="comision_porcentaje"
            name="comision_porcentaje"
            type="text"
            inputMode="decimal"
            defaultValue="0"
            className="w-full h-12 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-base tabular-nums"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="comision_base" className="text-sm font-medium">Base</label>
          <select
            id="comision_base"
            name="comision_base"
            defaultValue="venta_total"
            className="w-full h-12 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm"
          >
            <option value="venta_total">Venta total</option>
            <option value="utilidad">Utilidad</option>
            <option value="producto_especifico">Producto específico</option>
            <option value="fijo">Monto fijo</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Frecuencia de pago</label>
        <input type="hidden" name="frecuencia_pago" value={frec} />
        <div className="grid grid-cols-3 gap-1.5">
          {(['semanal', 'quincenal', 'mensual'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrec(f)}
              className={cn(
                'h-10 rounded-lg text-xs font-medium border transition-colors capitalize',
                frec === f
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-[var(--border-subtle)] text-zinc-300'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="dia_de_pago" className="text-sm font-medium">Día de pago</label>
        <input
          id="dia_de_pago"
          name="dia_de_pago"
          type="number"
          min={1}
          max={31}
          placeholder="15"
          className="w-full h-12 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-base"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50"
      >
        {pending ? 'Agregando…' : 'Agregar compensación'}
      </button>
    </form>
  )
}
