'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createCuentaPorCobrar, type ActionState } from '@/app/(app)/por-cobrar/actions'
import { hoyEnCabos } from '@/lib/fechas'
import { toast } from '@/components/ui/toast'

type Negocio = { id: string; nombre: string }

const CATEGORIAS = ['servicio', 'producto', 'evento', 'consultoría', 'renta', 'otro']

export function CuentaCobrarForm({ negocios }: { negocios: Negocio[] }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createCuentaPorCobrar, {})
  const [moneda, setMoneda] = useState<'MXN' | 'USD'>('MXN')
  const [categoria, setCategoria] = useState<string>('')

  useEffect(() => {
    if (state.error) toast.error('No se pudo guardar', state.error)
  }, [state.error])

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="cliente_nombre" className="label-caps">Cliente *</label>
        <input id="cliente_nombre" name="cliente_nombre" type="text" required placeholder="María López, Hotel Esperanza..." className="input-base w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="cliente_telefono" className="label-caps">Teléfono</label>
          <input id="cliente_telefono" name="cliente_telefono" type="tel" placeholder="opcional" className="input-base w-full" />
        </div>
        <div className="space-y-2">
          <label htmlFor="cliente_email" className="label-caps">Email</label>
          <input id="cliente_email" name="cliente_email" type="email" placeholder="opcional" className="input-base w-full" />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="concepto" className="label-caps">Concepto *</label>
        <input id="concepto" name="concepto" type="text" required placeholder="Evento boda, consulta médica..." className="input-base w-full" />
      </div>

      <div className="space-y-2">
        <label htmlFor="monto_total" className="label-caps">Monto total *</label>
        <div className="flex gap-2">
          <input id="monto_total" name="monto_total" type="text" inputMode="decimal" required placeholder="0.00" className="input-base flex-1 text-xl font-bold tabular-nums" />
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            <input type="hidden" name="moneda" value={moneda} />
            {(['MXN', 'USD'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMoneda(m)}
                className={cn(
                  'h-12 w-14 rounded-lg text-sm font-bold transition-colors',
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
          <label htmlFor="fecha_emision" className="label-caps">Fecha emisión</label>
          <input id="fecha_emision" name="fecha_emision" type="date" defaultValue={hoyEnCabos()} className="input-base w-full" />
        </div>
        <div className="space-y-2">
          <label htmlFor="fecha_vencimiento" className="label-caps">Vencimiento</label>
          <input id="fecha_vencimiento" name="fecha_vencimiento" type="date" className="input-base w-full" />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="negocio_id" className="label-caps">Negocio (opcional)</label>
        <select id="negocio_id" name="negocio_id" className="input-base w-full">
          <option value="">— Sin asignar</option>
          {negocios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label className="label-caps">Categoría</label>
        <input type="hidden" name="categoria" value={categoria} />
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIAS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategoria(c)}
              className={cn(
                'h-8 px-3 rounded-full text-xs border transition-colors capitalize',
                categoria === c ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-[var(--border-subtle)] text-zinc-400'
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="referencia" className="label-caps">Referencia (factura/contrato)</label>
        <input id="referencia" name="referencia" type="text" placeholder="opcional" className="input-base w-full" />
      </div>

      <div className="space-y-2">
        <label htmlFor="notas" className="label-caps">Notas</label>
        <textarea id="notas" name="notas" rows={2} placeholder="opcional" className="input-base w-full !h-auto py-3 resize-none" />
      </div>

      {state.error && <p className="text-sm text-rose-400">{state.error}</p>}

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={() => router.back()} className="btn-ghost flex-1">Cancelar</button>
        <button type="submit" disabled={pending} className="btn-primary flex-[2]">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? 'Guardando' : 'Crear cuenta por cobrar'}
        </button>
      </div>
    </form>
  )
}
