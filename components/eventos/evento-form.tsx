'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createEvento, type ActionState } from '@/app/(app)/eventos/actions'

type Negocio = { id: string; nombre: string }

export function EventoForm({ negocios, fechaInicial }: { negocios: Negocio[]; fechaInicial?: string }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createEvento, {})
  const [moneda, setMoneda] = useState<'MXN' | 'USD'>('MXN')

  // Encuentra Rancho McCoy si existe
  const ranchoMcCoy = negocios.find((n) => /rancho|mccoy/i.test(n.nombre))?.id ?? ''

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="negocio_id" className="label-caps">Negocio (salón)</label>
        <select id="negocio_id" name="negocio_id" required defaultValue={ranchoMcCoy} className="input-base w-full">
          <option value="">— Selecciona</option>
          {negocios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label htmlFor="cliente_nombre" className="label-caps">Cliente</label>
        <input id="cliente_nombre" name="cliente_nombre" type="text" required placeholder="Nombre del novio/cliente" className="input-base w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="cliente_telefono" className="label-caps">Teléfono</label>
          <input id="cliente_telefono" name="cliente_telefono" type="tel" placeholder="+52 624..." className="input-base w-full" />
        </div>
        <div className="space-y-2">
          <label htmlFor="cliente_email" className="label-caps">Email</label>
          <input id="cliente_email" name="cliente_email" type="email" placeholder="opcional" className="input-base w-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="tipo_evento" className="label-caps">Tipo de evento</label>
          <input id="tipo_evento" name="tipo_evento" type="text" placeholder="Boda, XV años…" className="input-base w-full" />
        </div>
        <div className="space-y-2">
          <label htmlFor="paquete" className="label-caps">Paquete</label>
          <input id="paquete" name="paquete" type="text" list="paquetes-comunes" placeholder="ELIT, PLATINO, VIP…" className="input-base w-full" />
          <datalist id="paquetes-comunes">
            <option value="ELIT" />
            <option value="ELITE" />
            <option value="PLATINO" />
            <option value="VIP" />
            <option value="ELIT con sesión de fotos" />
            <option value="ELITE 2 cabañas" />
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="num_personas" className="label-caps">Personas</label>
          <input id="num_personas" name="num_personas" type="number" min="0" placeholder="100" className="input-base w-full" />
        </div>
        <div className="space-y-2">
          <label htmlFor="duracion_horas" className="label-caps">Duración (horas)</label>
          <input id="duracion_horas" name="duracion_horas" type="number" min="0" max="48" placeholder="10" className="input-base w-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="fecha_evento" className="label-caps">Fecha</label>
          <input id="fecha_evento" name="fecha_evento" type="date" required defaultValue={fechaInicial} className="input-base w-full" />
        </div>
        <div className="space-y-2">
          <label htmlFor="hora_evento" className="label-caps">Hora</label>
          <input id="hora_evento" name="hora_evento" type="time" className="input-base w-full" />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="monto_total" className="label-caps">Monto total al cliente</label>
        <div className="flex gap-2">
          <input id="monto_total" name="monto_total" type="text" inputMode="decimal" required placeholder="0.00" className="input-base flex-1 text-xl font-bold tabular-nums" />
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
        <input id="comision_porcentaje" name="comision_porcentaje" type="number" min="0" max="100" step="0.5" defaultValue="25" className="input-base w-full" />
        <p className="text-[10px] text-zinc-500">El resto (%) se contabiliza como pago al proveedor cuando se finalice el evento.</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="proveedor_nombre" className="label-caps">Proveedor del lugar</label>
        <input id="proveedor_nombre" name="proveedor_nombre" type="text" placeholder="Nombre del dueño/rancho" className="input-base w-full" />
      </div>

      <div className="space-y-2">
        <label htmlFor="notas" className="label-caps">Notas</label>
        <textarea id="notas" name="notas" rows={3} placeholder="Detalles del evento" className="input-base w-full !h-auto py-3 resize-none" />
      </div>

      {state.error && <p className="text-sm text-rose-400">{state.error}</p>}

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={() => router.back()} className="btn-ghost flex-1">Cancelar</button>
        <button type="submit" disabled={pending} className="btn-primary flex-[2]">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? 'Guardando…' : 'Crear evento'}
        </button>
      </div>
    </form>
  )
}
