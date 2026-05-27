'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createEvento, actualizarEvento, type ActionState } from '@/app/(app)/eventos/actions'

type Negocio = { id: string; nombre: string }

export type EventoInicial = {
  id?: string
  negocio_id?: string | null
  cliente_nombre?: string | null
  cliente_telefono?: string | null
  cliente_email?: string | null
  tipo_evento?: string | null
  paquete?: string | null
  num_personas?: number | null
  duracion_horas?: number | null
  fecha_evento?: string | null
  hora_evento?: string | null
  monto_total?: number | null
  moneda?: 'MXN' | 'USD'
  comision_porcentaje?: number | null
  proveedor_nombre?: string | null
  estado?: string | null
  notas?: string | null
}

const ESTADOS: Array<{ value: string; label: string }> = [
  { value: 'reservado',        label: '🟡 Reservado' },
  { value: 'confirmado',       label: '🔵 Confirmado' },
  { value: 'realizado',        label: '🟢 Realizado' },
  { value: 'pagado_proveedor', label: '✅ Cerrado (proveedor pagado)' },
  { value: 'cancelado',        label: '❌ Cancelado' },
]

export function EventoForm({
  negocios,
  fechaInicial,
  evento,
  modo = 'crear',
}: {
  negocios: Negocio[]
  fechaInicial?: string
  evento?: EventoInicial
  modo?: 'crear' | 'editar'
}) {
  const router = useRouter()
  const accion = modo === 'editar' ? actualizarEvento : createEvento
  const [state, formAction, pending] = useActionState<ActionState, FormData>(accion, {})
  const [moneda, setMoneda] = useState<'MXN' | 'USD'>(evento?.moneda ?? 'MXN')

  const ranchoMcCoy = negocios.find((n) => /rancho|mccoy/i.test(n.nombre))?.id ?? ''
  const defaultNegocio = evento?.negocio_id ?? ranchoMcCoy

  return (
    <form action={formAction} className="space-y-5">
      {modo === 'editar' && evento?.id && (
        <input type="hidden" name="id" value={evento.id} />
      )}

      <div className="space-y-2">
        <label htmlFor="negocio_id" className="label-caps">Negocio (salón)</label>
        <select id="negocio_id" name="negocio_id" required defaultValue={defaultNegocio} className="input-base w-full">
          <option value="">— Selecciona</option>
          {negocios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="cliente_nombre" className="label-caps">Cliente</label>
        <input id="cliente_nombre" name="cliente_nombre" type="text" required defaultValue={evento?.cliente_nombre ?? ''} placeholder="Nombre del novio/cliente" className="input-base w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="cliente_telefono" className="label-caps">Teléfono</label>
          <input id="cliente_telefono" name="cliente_telefono" type="tel" defaultValue={evento?.cliente_telefono ?? ''} placeholder="+52 624..." className="input-base w-full" />
        </div>
        <div className="space-y-2">
          <label htmlFor="cliente_email" className="label-caps">Email</label>
          <input id="cliente_email" name="cliente_email" type="email" defaultValue={evento?.cliente_email ?? ''} placeholder="opcional" className="input-base w-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="tipo_evento" className="label-caps">Tipo de evento</label>
          <input id="tipo_evento" name="tipo_evento" type="text" defaultValue={evento?.tipo_evento ?? ''} list="tipos-evento" placeholder="Boda, XV años…" className="input-base w-full" />
          <datalist id="tipos-evento">
            <option value="Boda" />
            <option value="XV años" />
            <option value="Cumpleaños" />
            <option value="Corporativo" />
            <option value="Babyshower" />
            <option value="Despedida soltera" />
            <option value="Despedida soltero" />
            <option value="Bautizo" />
            <option value="Aniversario" />
          </datalist>
        </div>
        <div className="space-y-2">
          <label htmlFor="paquete" className="label-caps">Paquete</label>
          <input id="paquete" name="paquete" type="text" defaultValue={evento?.paquete ?? ''} list="paquetes-comunes" placeholder="ELIT, PLATINO, VIP…" className="input-base w-full" />
          <datalist id="paquetes-comunes">
            <option value="ELIT" />
            <option value="ELITE" />
            <option value="PLATINO" />
            <option value="VIP" />
            <option value="Princess todo incluido" />
            <option value="ELIT con sesión de fotos" />
            <option value="ELITE 2 cabañas" />
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="num_personas" className="label-caps">Personas</label>
          <input id="num_personas" name="num_personas" type="number" min="0" defaultValue={evento?.num_personas ?? ''} placeholder="100" className="input-base w-full" />
        </div>
        <div className="space-y-2">
          <label htmlFor="duracion_horas" className="label-caps">Duración (horas)</label>
          <input id="duracion_horas" name="duracion_horas" type="number" min="0" max="48" defaultValue={evento?.duracion_horas ?? ''} placeholder="10" className="input-base w-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="fecha_evento" className="label-caps">Fecha</label>
          <input id="fecha_evento" name="fecha_evento" type="date" required defaultValue={evento?.fecha_evento ?? fechaInicial ?? ''} className="input-base w-full" />
        </div>
        <div className="space-y-2">
          <label htmlFor="hora_evento" className="label-caps">Hora</label>
          <input id="hora_evento" name="hora_evento" type="time" defaultValue={evento?.hora_evento ?? ''} className="input-base w-full" />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="monto_total" className="label-caps">Monto total al cliente</label>
        <div className="flex gap-2">
          <input
            id="monto_total"
            name="monto_total"
            type="text"
            inputMode="decimal"
            required
            defaultValue={evento?.monto_total ?? ''}
            placeholder="0.00"
            className="input-base flex-1 text-xl font-bold tabular-nums"
          />
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-input)]">
            <input type="hidden" name="moneda" value={moneda} />
            {(['MXN', 'USD'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMoneda(m)}
                className={cn(
                  'h-10 w-14 rounded-lg text-sm font-bold transition-colors',
                  moneda === m ? 'bg-[var(--bg-card)] text-white shadow' : 'text-zinc-500'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="comision_porcentaje" className="label-caps">Tu comisión %</label>
        <input
          id="comision_porcentaje"
          name="comision_porcentaje"
          type="number"
          min="0"
          max="100"
          step="0.5"
          defaultValue={evento?.comision_porcentaje ?? 25}
          className="input-base w-full"
        />
        <p className="text-[10px] text-zinc-500">El resto (%) se contabiliza como pago al proveedor cuando se finalice el evento.</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="proveedor_nombre" className="label-caps">Proveedor del lugar</label>
        <input id="proveedor_nombre" name="proveedor_nombre" type="text" defaultValue={evento?.proveedor_nombre ?? ''} placeholder="Nombre del dueño/rancho" className="input-base w-full" />
      </div>

      {modo === 'editar' && (
        <div className="space-y-2">
          <label htmlFor="estado" className="label-caps">Estado</label>
          <select id="estado" name="estado" defaultValue={evento?.estado ?? 'reservado'} className="input-base w-full">
            {ESTADOS.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="notas" className="label-caps">Notas</label>
        <textarea id="notas" name="notas" rows={3} defaultValue={evento?.notas ?? ''} placeholder="Detalles del evento" className="input-base w-full !h-auto py-3 resize-none" />
      </div>

      {state.error && <p className="text-sm text-rose-400">{state.error}</p>}

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={() => router.back()} className="btn-ghost flex-1">Cancelar</button>
        <button type="submit" disabled={pending} className="btn-primary flex-[2]">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {pending ? 'Guardando…' : modo === 'editar' ? 'Guardar cambios' : 'Crear evento'}
        </button>
      </div>
    </form>
  )
}
