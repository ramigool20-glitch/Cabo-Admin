'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { createEmpleado, updateEmpleado, type ActionState } from '@/app/(app)/nomina/actions'

export type EmpleadoDefault = {
  id?: string
  nombre?: string
  puesto?: string | null
  fecha_ingreso?: string | null
  notas?: string | null
}

export function EmpleadoForm({ defaults }: { defaults: EmpleadoDefault }) {
  const router = useRouter()
  const isEdit = !!defaults.id
  const action = isEdit ? updateEmpleado.bind(null, defaults.id!) : createEmpleado
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {})

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="nombre" className="text-sm font-medium">Nombre</label>
        <input
          id="nombre"
          name="nombre"
          type="text"
          required
          defaultValue={defaults.nombre ?? ''}
          className="w-full h-12 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="puesto" className="text-sm font-medium">Puesto</label>
        <input
          id="puesto"
          name="puesto"
          type="text"
          defaultValue={defaults.puesto ?? ''}
          placeholder="Cajera, enfermera, repartidor…"
          className="w-full h-12 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="fecha_ingreso" className="text-sm font-medium">Fecha de ingreso</label>
        <input
          id="fecha_ingreso"
          name="fecha_ingreso"
          type="date"
          defaultValue={defaults.fecha_ingreso ?? ''}
          className="w-full h-12 px-4 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="notas" className="text-sm font-medium">Notas</label>
        <textarea
          id="notas"
          name="notas"
          rows={2}
          defaultValue={defaults.notas ?? ''}
          className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-base resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={() => router.back()} className="flex-1 h-12 rounded-xl border border-zinc-300 dark:border-zinc-700 font-medium">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="flex-[2] h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50">
          {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
