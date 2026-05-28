'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createTarea, type ActionState } from '@/app/(app)/tareas/actions'

type Profile = { id: string; nombre: string }
type Negocio = { id: string; nombre: string }

const CATEGORIAS = [
  { v: 'operativa',      l: '🛠 Operativa' },
  { v: 'administrativa', l: '📋 Admin' },
  { v: 'pago',           l: '💸 Pago' },
  { v: 'corte',          l: '📊 Corte' },
  { v: 'auditoria',      l: '🔍 Auditoría' },
  { v: 'otra',           l: '📌 Otra' },
] as const

export function TareaForm({ perfiles, negocios, esEnfermera = false }: { perfiles: Profile[]; negocios: Negocio[]; esEnfermera?: boolean }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createTarea, {})

  const [asignadas, setAsignadas] = useState<string[]>([])
  const [prioridad, setPrioridad] = useState<'alta' | 'media' | 'baja'>('media')
  const [categoria, setCategoria] = useState<string>('operativa')
  const [moneda, setMoneda] = useState<'MXN' | 'USD'>('MXN')
  const [tieneMulta, setTieneMulta] = useState(false)

  const toggleAsignada = (id: string) => {
    setAsignadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // Defecto: mañana a las 9 PM Cabos
  const defaultDate = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(21, 0, 0, 0)
    return d.toISOString().slice(0, 16)
  }

  return (
    <form action={formAction} className="space-y-5">
      {/* Título */}
      <div className="space-y-2">
        <label htmlFor="titulo" className="label-caps">Título</label>
        <input
          id="titulo"
          name="titulo"
          type="text"
          required
          placeholder="Subir corte de farmacia"
          className="input-base w-full"
        />
      </div>

      {/* Descripción */}
      <div className="space-y-2">
        <label htmlFor="descripcion" className="label-caps">Descripción</label>
        <textarea
          id="descripcion"
          name="descripcion"
          rows={2}
          placeholder="Detalle opcional"
          className="input-base w-full !h-auto py-3 resize-none"
        />
      </div>

      {/* Asignar a */}
      <div className="space-y-2">
        <p className="label-caps">{esEnfermera ? 'Enviar a' : 'Asignar a (uno o ambos)'}</p>
        <div className="flex flex-wrap gap-1.5">
          {perfiles.map((p) => (
            <label key={p.id} className="cursor-pointer">
              <input
                type="checkbox"
                name="asignada_a"
                value={p.id}
                checked={asignadas.includes(p.id)}
                onChange={() => toggleAsignada(p.id)}
                className="sr-only"
              />
              <span
                className={cn(
                  'inline-flex items-center h-9 px-3 rounded-full text-sm border transition-colors',
                  asignadas.includes(p.id)
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-zinc-700 bg-[var(--bg-card)] text-zinc-300'
                )}
              >
                {p.nombre}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Fecha límite */}
      <div className="space-y-2">
        <label htmlFor="fecha_limite" className="label-caps">Fecha límite</label>
        <input
          id="fecha_limite"
          name="fecha_limite"
          type="datetime-local"
          required
          defaultValue={defaultDate()}
          className="input-base w-full"
        />
      </div>

      {/* Prioridad */}
      <div className="space-y-2">
        <p className="label-caps">Prioridad</p>
        <input type="hidden" name="prioridad" value={prioridad} />
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { v: 'alta', l: 'Alta', color: 'rose' },
            { v: 'media', l: 'Media', color: 'amber' },
            { v: 'baja', l: 'Baja', color: 'emerald' },
          ].map((p) => (
            <button
              key={p.v}
              type="button"
              onClick={() => setPrioridad(p.v as 'alta' | 'media' | 'baja')}
              className={cn(
                'h-10 rounded-lg text-xs font-bold border transition-colors',
                prioridad === p.v
                  ? p.color === 'rose'
                    ? 'border-rose-500 bg-rose-500 text-white'
                    : p.color === 'amber'
                      ? 'border-amber-500 bg-amber-500 text-zinc-950'
                      : 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-zinc-700 text-zinc-400'
              )}
            >
              {p.l}
            </button>
          ))}
        </div>
      </div>

      {/* Categoría / Negocio / Multa: solo para socios-admin, no para la enfermera */}
      {!esEnfermera && (
        <>
          <div className="space-y-2">
            <p className="label-caps">Categoría</p>
            <input type="hidden" name="categoria" value={categoria} />
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIAS.map((c) => (
                <button
                  key={c.v}
                  type="button"
                  onClick={() => setCategoria(c.v)}
                  className={cn(
                    'h-8 px-3 rounded-full text-xs border transition-colors',
                    categoria === c.v
                      ? 'border-cyan-500 bg-cyan-500 text-white'
                      : 'border-zinc-700 text-zinc-400'
                  )}
                >
                  {c.l}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="negocio_id" className="label-caps">Negocio (opcional)</label>
            <select id="negocio_id" name="negocio_id" className="input-base w-full">
              <option value="">— Sin negocio</option>
              {negocios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
            </select>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={tieneMulta}
              onChange={(e) => setTieneMulta(e.target.checked)}
              className="h-5 w-5 rounded border-cyan-500/40 bg-[var(--bg-input)] text-cyan-500"
            />
            <span className="text-sm text-zinc-300">Aplicar multa si no se completa a tiempo</span>
          </label>

          {tieneMulta && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label htmlFor="multa_monto" className="label-caps">Monto multa</label>
                <input
                  id="multa_monto"
                  name="multa_monto"
                  type="text"
                  inputMode="decimal"
                  placeholder="500"
                  className="input-base w-full"
                />
              </div>
              <div className="space-y-2">
                <p className="label-caps">Moneda</p>
                <input type="hidden" name="moneda_multa" value={moneda} />
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-input)] h-12">
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
          )}
        </>
      )}

      {state.error && <p className="text-sm text-rose-400">{state.error}</p>}
      {state.fieldErrors && (
        <ul className="text-sm text-rose-400 list-disc list-inside">
          {Object.entries(state.fieldErrors).map(([k, v]) =>
            v?.map((e) => <li key={k + e}>{k}: {e}</li>)
          )}
        </ul>
      )}

      <div className="flex gap-2 pt-2">
        <button type="button" onClick={() => router.back()} className="btn-ghost flex-1">
          Cancelar
        </button>
        <button type="submit" disabled={pending || asignadas.length === 0} className="btn-primary flex-[2]">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {pending ? 'Creando…' : 'Crear tarea'}
        </button>
      </div>
    </form>
  )
}
