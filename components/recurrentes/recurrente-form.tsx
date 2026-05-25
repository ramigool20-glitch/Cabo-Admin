'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { METODOS_PAGO, CATEGORIAS_GASTO } from '@/lib/categorias'
import {
  createRecurrente,
  updateRecurrente,
  deleteRecurrente,
  type ActionState,
} from '@/app/(app)/recurrentes/actions'

type Negocio = { id: string; nombre: string }
type Cuenta = { id: string; nombre: string; moneda: string }
type Profile = { id: string; nombre: string }

export type RecurrenteDefault = {
  id?: string
  nombre?: string
  monto?: string
  moneda?: 'MXN' | 'USD'
  negocio_id?: string | null
  cuenta_id?: string | null
  responsable_id?: string | null
  metodo_pago?: string | null
  proveedor?: string | null
  referencia_pago?: string | null
  comprobante_requerido?: boolean
  frecuencia?: 'mensual' | 'quincenal' | 'semanal' | 'anual'
  dia_del_mes?: number | null
  proximo_pago?: string | null
  multa_por_no_pago?: string | null
  categoria?: string | null
  notas?: string | null
}

export function RecurrenteForm({
  negocios,
  cuentas,
  perfiles,
  defaults,
}: {
  negocios: Negocio[]
  cuentas: Cuenta[]
  perfiles: Profile[]
  defaults: RecurrenteDefault
}) {
  const router = useRouter()
  const isEdit = !!defaults.id
  const action = isEdit ? updateRecurrente.bind(null, defaults.id!) : createRecurrente
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {})

  const [moneda, setMoneda] = useState<'MXN' | 'USD'>(defaults.moneda ?? 'MXN')
  const [frecuencia, setFrecuencia] = useState<string>(defaults.frecuencia ?? 'mensual')
  const [categoria, setCategoria] = useState<string>(defaults.categoria ?? '')
  const [compReq, setCompReq] = useState<boolean>(defaults.comprobante_requerido ?? false)

  const handleDelete = async () => {
    if (!defaults.id) return
    if (!confirm('¿Desactivar este gasto recurrente?')) return
    await deleteRecurrente(defaults.id)
  }

  return (
    <form action={formAction} className="space-y-5">
      {/* Nombre */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="nombre">Nombre</label>
        <input
          id="nombre"
          name="nombre"
          type="text"
          required
          defaultValue={defaults.nombre ?? ''}
          placeholder="Renta local farmacia, Sueldo limpieza…"
          className="w-full h-12 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Monto + moneda */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="monto">Monto</label>
        <div className="flex gap-2">
          <input
            id="monto"
            name="monto"
            type="text"
            inputMode="decimal"
            required
            defaultValue={defaults.monto ?? ''}
            placeholder="0.00"
            className="flex-1 h-14 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-2xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-zinc-800">
            <input type="hidden" name="moneda" value={moneda} />
            {(['MXN', 'USD'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMoneda(m)}
                className={cn(
                  'h-12 w-14 rounded-lg text-sm font-bold transition-colors',
                  moneda === m
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow'
                    : 'text-zinc-500'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Frecuencia */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Frecuencia</label>
        <input type="hidden" name="frecuencia" value={frecuencia} />
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { v: 'mensual',    l: 'Mensual' },
            { v: 'quincenal',  l: 'Quincenal' },
            { v: 'semanal',    l: 'Semanal' },
            { v: 'anual',      l: 'Anual' },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setFrecuencia(o.v)}
              className={cn(
                'h-10 rounded-lg text-xs font-medium border transition-colors',
                frecuencia === o.v
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
              )}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {/* Día del mes (solo mensual) */}
      {frecuencia === 'mensual' && (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="dia_del_mes">Día del mes</label>
          <input
            id="dia_del_mes"
            name="dia_del_mes"
            type="number"
            min={1}
            max={31}
            defaultValue={defaults.dia_del_mes ?? ''}
            placeholder="1"
            className="w-full h-12 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}

      {/* Próximo pago */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="proximo_pago">Próximo pago</label>
        <input
          id="proximo_pago"
          name="proximo_pago"
          type="date"
          defaultValue={defaults.proximo_pago ?? ''}
          className="w-full h-12 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <p className="text-xs text-zinc-500">Si lo dejas vacío lo calculo desde la frecuencia.</p>
      </div>

      {/* Negocio */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="negocio_id">Negocio (opcional)</label>
        <select
          id="negocio_id"
          name="negocio_id"
          defaultValue={defaults.negocio_id ?? ''}
          className="w-full h-12 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">— Sin negocio (gasto general)</option>
          {negocios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select>
      </div>

      {/* Cuenta de pago */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="cuenta_id">Cuenta de pago</label>
        <select
          id="cuenta_id"
          name="cuenta_id"
          defaultValue={defaults.cuenta_id ?? ''}
          className="w-full h-12 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">— Sin cuenta específica</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
        </select>
      </div>

      {/* Responsable */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="responsable_id">Responsable</label>
        <select
          id="responsable_id"
          name="responsable_id"
          defaultValue={defaults.responsable_id ?? ''}
          className="w-full h-12 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">— Sin asignar</option>
          {perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>

      {/* Proveedor */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="proveedor">Proveedor / a quién se le paga</label>
        <input
          id="proveedor"
          name="proveedor"
          type="text"
          defaultValue={defaults.proveedor ?? ''}
          placeholder="Nombre del arrendador, proveedor, persona…"
          className="w-full h-12 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Método de pago */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="metodo_pago">Método de pago</label>
        <select
          id="metodo_pago"
          name="metodo_pago"
          defaultValue={defaults.metodo_pago ?? ''}
          className="w-full h-12 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">— Sin especificar</option>
          {METODOS_PAGO.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {/* Referencia */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="referencia_pago">Referencia (CLABE, # cuenta, link)</label>
        <input
          id="referencia_pago"
          name="referencia_pago"
          type="text"
          defaultValue={defaults.referencia_pago ?? ''}
          placeholder="Opcional"
          className="w-full h-12 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Categoría */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Categoría</label>
        <input type="hidden" name="categoria" value={categoria} />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIAS_GASTO.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategoria(c)}
              className={cn(
                'h-8 px-2.5 rounded-full text-xs border transition-colors',
                categoria === c
                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-700'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-600'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Comprobante requerido */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="comprobante_requerido"
          checked={compReq}
          onChange={(e) => setCompReq(e.target.checked)}
          className="h-5 w-5 rounded border-zinc-300 dark:border-zinc-700 text-emerald-600 focus:ring-emerald-500"
        />
        <span className="text-sm">Pedir foto del comprobante al marcar pagado</span>
      </label>

      {/* Multa */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="multa_por_no_pago">Multa por no pago (opcional)</label>
        <input
          id="multa_por_no_pago"
          name="multa_por_no_pago"
          type="text"
          inputMode="decimal"
          defaultValue={defaults.multa_por_no_pago ?? ''}
          placeholder="0"
          className="w-full h-12 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <p className="text-xs text-zinc-500">Si pasas 1 día del vencimiento sin marcarlo pagado, se crea una tarea con esta multa al responsable.</p>
      </div>

      {/* Notas */}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="notas">Notas</label>
        <textarea
          id="notas"
          name="notas"
          rows={2}
          defaultValue={defaults.notas ?? ''}
          className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.fieldErrors && (
        <ul className="text-sm text-red-600 list-disc list-inside">
          {Object.entries(state.fieldErrors).map(([k, v]) =>
            v?.map((e) => <li key={k + e}>{k}: {e}</li>)
          )}
        </ul>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 h-12 rounded-xl border border-zinc-300 dark:border-zinc-700 font-medium"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-[2] h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50"
        >
          {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar'}
        </button>
      </div>

      {isEdit && (
        <button
          type="button"
          onClick={handleDelete}
          className="w-full mt-2 h-11 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 font-medium flex items-center justify-center gap-2"
        >
          <Trash2 className="h-4 w-4" /> Desactivar
        </button>
      )}
    </form>
  )
}
