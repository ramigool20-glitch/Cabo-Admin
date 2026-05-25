'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/utils'
import { saveAITransaccion, type SavePayload } from '@/app/(app)/chat/save-action'

export type Negocio = { id: string; nombre: string; tipo: string }
export type Cuenta = { id: string; nombre: string; moneda: 'MXN' | 'USD'; tipo: string | null }

export type Draft = {
  tipo: 'ingreso' | 'gasto'
  monto: number
  moneda: 'MXN' | 'USD'
  fecha: string
  concepto: string
  categoria: string | null
  negocio_sugerido?: string | null
  cuenta_sugerida?: string | null
  metodo_pago?: string | null
  metodo_captura: 'foto' | 'voz'
  foto_url?: string | null
  audio_url?: string | null
  raw_ai_response?: unknown
}

function matchByNombre<T extends { nombre: string }>(items: T[], hint: string | null | undefined): T | undefined {
  if (!hint) return undefined
  const lower = hint.toLowerCase()
  return items.find((i) => i.nombre.toLowerCase().includes(lower) || lower.includes(i.nombre.toLowerCase()))
}

export function ConfirmCard({
  draft,
  negocios,
  cuentas,
  onSaved,
  onCancel,
}: {
  draft: Draft
  negocios: Negocio[]
  cuentas: Cuenta[]
  onSaved: (id: string) => void
  onCancel: () => void
}) {
  const negocioInicial = matchByNombre(negocios, draft.negocio_sugerido)?.id ?? ''
  const cuentaInicial = matchByNombre(cuentas, draft.cuenta_sugerida)?.id ?? ''

  const [negocioId, setNegocioId] = useState<string>(negocioInicial)
  const [cuentaId, setCuentaId] = useState<string>(cuentaInicial)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const cuentaSel = cuentas.find((c) => c.id === cuentaId)
  const moneda = cuentaSel?.moneda ?? draft.moneda

  const handleSave = () => {
    setError(null)
    if (!negocioId) {
      setError('Selecciona un negocio')
      return
    }
    if (!cuentaId) {
      setError('Selecciona una cuenta')
      return
    }

    startTransition(async () => {
      const payload: SavePayload = {
        tipo: draft.tipo,
        monto: draft.monto,
        moneda,
        fecha: draft.fecha,
        negocio_id: negocioId,
        cuenta_id: cuentaId,
        metodo_pago: draft.metodo_pago ?? null,
        categoria: draft.categoria ?? null,
        concepto: draft.concepto || null,
        metodo_captura: draft.metodo_captura,
        foto_url: draft.foto_url ?? null,
        audio_url: draft.audio_url ?? null,
        raw_ai_response: draft.raw_ai_response,
      }
      const res = await saveAITransaccion(payload)
      if (!res.ok) {
        setError(res.error || 'Error guardando')
        return
      }
      if (res.id) onSaved(res.id)
    })
  }

  return (
    <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'inline-flex items-center text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-full',
            draft.tipo === 'gasto'
              ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'
              : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
          )}
        >
          {draft.tipo}
        </span>
        <p className="text-2xl font-bold tabular-nums">
          {formatMoney(draft.monto, moneda)}
        </p>
      </div>

      {draft.concepto && (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{draft.concepto}</p>
      )}

      {draft.categoria && (
        <p className="text-xs text-zinc-500">Categoría: <span className="font-medium">{draft.categoria}</span></p>
      )}

      <p className="text-xs text-zinc-500">Fecha: {draft.fecha}</p>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-zinc-500">Negocio</p>
        <div className="flex flex-wrap gap-1.5">
          {negocios.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNegocioId(n.id)}
              className={cn(
                'h-8 px-3 rounded-full text-xs border',
                negocioId === n.id
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
              )}
            >
              {n.nombre}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-zinc-500">Cuenta</p>
        <div className="flex flex-wrap gap-1.5">
          {cuentas.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCuentaId(c.id)}
              className={cn(
                'h-8 px-3 rounded-full text-xs border',
                cuentaId === c.id
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
              )}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="flex-1 h-11 rounded-xl border border-zinc-300 dark:border-zinc-700 text-sm font-medium"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className={cn(
            'flex-[2] h-11 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50',
            draft.tipo === 'gasto' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
          )}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {pending ? 'Guardando' : 'Confirmar y guardar'}
        </button>
      </div>
    </div>
  )
}
