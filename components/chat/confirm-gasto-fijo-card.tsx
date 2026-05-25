'use client'

import { useState, useTransition, useEffect } from 'react'
import { Check, Loader2, Calendar } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import type { ChatGastoFijoDraft } from '@/lib/ai/prompts'
import { saveGastoFijo, resolverIds } from '@/app/(app)/chat/save-gasto-fijo'

type Negocio = { id: string; nombre: string }
type Cuenta = { id: string; nombre: string; moneda: string }
type Profile = { id: string; nombre: string }

export function ConfirmGastoFijoCard({
  draft,
  negocios,
  cuentas,
  perfiles,
  onSaved,
  onCancel,
}: {
  draft: ChatGastoFijoDraft
  negocios: Negocio[]
  cuentas: Cuenta[]
  perfiles: Profile[]
  onSaved: (id: string) => void
  onCancel: () => void
}) {
  const [negocioId, setNegocioId] = useState<string>('')
  const [cuentaId, setCuentaId] = useState<string>('')
  const [responsableId, setResponsableId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    // Resolvemos los nombres a IDs al montar
    resolverIds({
      negocio_nombre: draft.negocio_sugerido,
      cuenta_nombre: draft.cuenta_sugerida,
      responsable_nombre: draft.responsable_sugerido,
    }).then((r) => {
      if (r.negocio?.id) setNegocioId(r.negocio.id)
      if (r.cuenta?.id) setCuentaId(r.cuenta.id)
      if (r.responsable?.id) setResponsableId(r.responsable.id)
    })
  }, [draft])

  const handleSave = () => {
    setError(null)
    if (!draft.nombre || !draft.monto) {
      setError('Falta nombre o monto')
      return
    }
    startTransition(async () => {
      const res = await saveGastoFijo({
        nombre: draft.nombre,
        monto: draft.monto,
        moneda: draft.moneda,
        frecuencia: draft.frecuencia,
        dia_del_mes: draft.dia_del_mes,
        proximo_pago: draft.proximo_pago,
        negocio_id: negocioId || null,
        cuenta_id: cuentaId || null,
        responsable_id: responsableId || null,
        proveedor: draft.proveedor,
        metodo_pago: draft.metodo_pago,
        categoria: draft.categoria,
        multa_por_no_pago: draft.multa_por_no_pago,
        comprobante_requerido: draft.comprobante_requerido,
      })
      if (!res.ok) {
        setError(res.error || 'Error guardando')
        return
      }
      if (res.id) onSaved(res.id)
    })
  }

  return (
    <div className="card-glow p-4 space-y-3">
      {/* Header con badge */}
      <div className="flex items-center justify-between">
        <span className="chip chip-cyan">
          <Calendar className="h-3 w-3" /> Gasto fijo
        </span>
        <p className="text-2xl font-bold tabular-nums">
          {formatMoney(draft.monto, draft.moneda)}
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-semibold text-white">{draft.nombre}</p>
        <p className="text-xs text-zinc-400 capitalize">
          {draft.frecuencia}
          {draft.dia_del_mes ? ` · día ${draft.dia_del_mes} del mes` : ''}
          {draft.proximo_pago ? ` · próximo ${draft.proximo_pago}` : ''}
        </p>
        {draft.proveedor && (
          <p className="text-xs text-zinc-500">→ Proveedor: {draft.proveedor}</p>
        )}
        {draft.categoria && (
          <p className="text-xs text-zinc-500">Categoría: {draft.categoria}</p>
        )}
        {draft.multa_por_no_pago && draft.multa_por_no_pago > 0 && (
          <p className="text-xs text-amber-400">
            ⚠ Multa si no se paga: {formatMoney(draft.multa_por_no_pago, draft.moneda)}
          </p>
        )}
      </div>

      {/* Negocio */}
      <div className="space-y-1.5">
        <p className="label-caps">Negocio</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setNegocioId('')}
            className={cn(
              'h-7 px-2.5 rounded-full text-[11px] border transition-colors',
              !negocioId
                ? 'border-cyan-500 bg-cyan-500 text-white'
                : 'border-zinc-700 text-zinc-400'
            )}
          >
            Sin negocio
          </button>
          {negocios.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNegocioId(n.id)}
              className={cn(
                'h-7 px-2.5 rounded-full text-[11px] border transition-colors',
                negocioId === n.id
                  ? 'border-cyan-500 bg-cyan-500 text-white'
                  : 'border-zinc-700 text-zinc-300'
              )}
            >
              {n.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Cuenta */}
      <div className="space-y-1.5">
        <p className="label-caps">Cuenta de pago</p>
        <div className="flex flex-wrap gap-1.5">
          {cuentas.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCuentaId(c.id)}
              className={cn(
                'h-7 px-2.5 rounded-full text-[11px] border transition-colors',
                cuentaId === c.id
                  ? 'border-cyan-500 bg-cyan-500 text-white'
                  : 'border-zinc-700 text-zinc-300'
              )}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Responsable */}
      <div className="space-y-1.5">
        <p className="label-caps">Responsable</p>
        <div className="flex flex-wrap gap-1.5">
          {perfiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setResponsableId(p.id)}
              className={cn(
                'h-7 px-2.5 rounded-full text-[11px] border transition-colors',
                responsableId === p.id
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-zinc-700 text-zinc-300'
              )}
            >
              {p.nombre}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="flex-1 h-11 rounded-xl border border-[var(--border-subtle)] text-sm font-medium text-zinc-300"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="flex-[2] h-11 rounded-xl btn-primary text-sm"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {pending ? 'Guardando' : 'Confirmar y guardar'}
        </button>
      </div>
    </div>
  )
}
