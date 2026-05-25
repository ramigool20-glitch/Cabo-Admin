'use client'

import { useActionState, useMemo, useState } from 'react'
import { registrarPagoNomina, type ActionState } from '@/app/(app)/nomina/actions'
import { hoyEnCabos } from '@/lib/fechas'
import { cn } from '@/lib/utils'

type Compensacion = {
  id: string
  negocio_id: string
  negocio_nombre: string
  sueldo_base: number
  comision_porcentaje: number
  moneda: 'MXN' | 'USD'
  frecuencia_pago: string
}

type Cuenta = { id: string; nombre: string; moneda: string }

export function PagoForm({
  empleadoId,
  compensaciones,
  cuentas,
}: {
  empleadoId: string
  compensaciones: Compensacion[]
  cuentas: Cuenta[]
}) {
  const action = registrarPagoNomina.bind(null, empleadoId)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {})

  const [compId, setCompId] = useState<string>(compensaciones[0]?.id ?? '')
  const [ventasPeriodo, setVentasPeriodo] = useState<string>('0')

  const comp = compensaciones.find((c) => c.id === compId)
  const comisionCalc = useMemo(() => {
    if (!comp) return 0
    return (Number(ventasPeriodo) || 0) * (comp.comision_porcentaje / 100)
  }, [comp, ventasPeriodo])
  const total = comp ? Number(comp.sueldo_base) + comisionCalc : 0

  if (compensaciones.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Primero agrega una compensación arriba para poder registrar pagos.
      </p>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Compensación</label>
        <input type="hidden" name="negocio_id" value={comp?.negocio_id ?? ''} />
        <input type="hidden" name="moneda" value={comp?.moneda ?? 'MXN'} />
        <div className="space-y-1.5">
          {compensaciones.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCompId(c.id)}
              className={cn(
                'w-full text-left rounded-xl border p-3 transition-colors',
                compId === c.id
                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950'
                  : 'border-zinc-300 dark:border-zinc-700'
              )}
            >
              <p className="text-sm font-medium">{c.negocio_nombre}</p>
              <p className="text-xs text-zinc-500">
                Base ${Number(c.sueldo_base).toLocaleString()} {c.moneda} · {c.comision_porcentaje}% · {c.frecuencia_pago}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="periodo_inicio" className="text-sm font-medium">Periodo desde</label>
          <input
            id="periodo_inicio"
            name="periodo_inicio"
            type="date"
            className="w-full h-12 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="periodo_fin" className="text-sm font-medium">Periodo hasta</label>
          <input
            id="periodo_fin"
            name="periodo_fin"
            type="date"
            defaultValue={hoyEnCabos()}
            className="w-full h-12 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="ventas_periodo" className="text-sm font-medium">Ventas del periodo (para calcular comisión)</label>
        <input
          id="ventas_periodo"
          name="ventas_periodo"
          type="text"
          inputMode="decimal"
          value={ventasPeriodo}
          onChange={(e) => setVentasPeriodo(e.target.value)}
          className="w-full h-12 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base tabular-nums"
        />
      </div>

      <div className="rounded-xl border bg-zinc-50 dark:bg-zinc-950 p-3 space-y-1 text-sm">
        <div className="flex justify-between"><span>Sueldo base</span><span className="tabular-nums">${Number(comp?.sueldo_base ?? 0).toLocaleString()}</span></div>
        <div className="flex justify-between"><span>Comisión ({comp?.comision_porcentaje}%)</span><span className="tabular-nums">${comisionCalc.toLocaleString()}</span></div>
        <div className="flex justify-between font-bold border-t pt-1 mt-1"><span>Total</span><span className="tabular-nums">${total.toLocaleString()} {comp?.moneda}</span></div>
      </div>

      <input type="hidden" name="sueldo_base_pagado" value={comp?.sueldo_base ?? 0} />
      <input type="hidden" name="comision_pagada" value={comisionCalc} />
      <input type="hidden" name="total" value={total} />

      <div className="space-y-2">
        <label htmlFor="fecha_pago" className="text-sm font-medium">Fecha de pago</label>
        <input
          id="fecha_pago"
          name="fecha_pago"
          type="date"
          required
          defaultValue={hoyEnCabos()}
          className="w-full h-12 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="cuenta_id" className="text-sm font-medium">Pagado desde</label>
        <select
          id="cuenta_id"
          name="cuenta_id"
          className="w-full h-12 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
        >
          <option value="">—</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
        </select>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || !compId || total <= 0}
        className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50"
      >
        {pending ? 'Guardando…' : 'Registrar pago'}
      </button>
    </form>
  )
}
