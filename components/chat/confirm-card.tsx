'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/utils'
import { saveAITransaccion, type SavePayload } from '@/app/(app)/chat/save-action'
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO } from '@/lib/categorias'

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

  // Estado editable del draft
  const [tipo, setTipo] = useState<'ingreso' | 'gasto'>(draft.tipo)
  const [monto, setMonto] = useState<string>(String(draft.monto))
  const [concepto, setConcepto] = useState<string>(draft.concepto || '')
  const [fecha, setFecha] = useState<string>(draft.fecha)
  const [categoria, setCategoria] = useState<string>(draft.categoria || '')
  const [negocioId, setNegocioId] = useState<string>(negocioInicial)
  const [cuentaId, setCuentaId] = useState<string>(cuentaInicial)
  const [editing, setEditing] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const cuentaSel = cuentas.find((c) => c.id === cuentaId)
  const moneda = cuentaSel?.moneda ?? draft.moneda
  const montoNum = Number(monto.replace(',', '.')) || 0

  const categoriasOpciones = tipo === 'gasto' ? CATEGORIAS_GASTO : CATEGORIAS_INGRESO

  const handleSave = () => {
    setError(null)
    if (!negocioId) { setError('Selecciona un negocio'); return }
    if (!cuentaId) { setError('Selecciona una cuenta'); return }
    if (montoNum <= 0) { setError('El monto debe ser mayor a 0'); return }

    startTransition(async () => {
      const payload: SavePayload = {
        tipo,
        monto: montoNum,
        moneda,
        fecha,
        negocio_id: negocioId,
        cuenta_id: cuentaId,
        metodo_pago: draft.metodo_pago ?? null,
        categoria: categoria || null,
        concepto: concepto || null,
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
    <div className="card-glow p-4 space-y-3">
      <div className="flex items-center justify-between">
        {editing ? (
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            {(['gasto', 'ingreso'] as const).map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => setTipo(tp)}
                className={cn(
                  'h-7 px-2 rounded text-[10px] font-bold uppercase transition-colors',
                  tipo === tp
                    ? (tp === 'gasto' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white')
                    : 'text-zinc-500'
                )}
              >
                {tp}
              </button>
            ))}
          </div>
        ) : (
          <span
            className={cn(
              'inline-flex items-center text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-full',
              tipo === 'gasto'
                ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'
                : 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
            )}
          >
            {tipo}
          </span>
        )}

        {editing ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="input-base h-10 w-28 text-right text-xl font-bold tabular-nums px-2"
            />
            <span className="text-xs text-zinc-500">{moneda}</span>
          </div>
        ) : (
          <p className="text-2xl font-bold tabular-nums">
            {formatMoney(montoNum, moneda)}
          </p>
        )}
      </div>

      {/* Concepto */}
      {editing ? (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Concepto</p>
          <input
            type="text"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="¿En qué fue?"
            className="input-base w-full text-sm"
          />
        </div>
      ) : (
        concepto && <p className="text-sm text-zinc-200">{concepto}</p>
      )}

      {/* Fecha */}
      {editing ? (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Fecha</p>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="input-base w-full text-sm"
          />
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Fecha: {fecha}</p>
      )}

      {/* Categoría */}
      {editing ? (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Categoría</p>
          <div className="flex flex-wrap gap-1.5">
            {categoriasOpciones.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoria(c === categoria ? '' : c)}
                className={cn(
                  'h-7 px-2.5 rounded-full text-[11px] border capitalize transition-colors',
                  categoria === c
                    ? 'border-cyan-500 bg-cyan-500 text-white'
                    : 'border-[var(--border-subtle)] text-zinc-400'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : (
        categoria && <p className="text-xs text-zinc-500">Categoría: <span className="font-medium">{categoria}</span></p>
      )}

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
                  : 'border-[var(--border-subtle)] text-zinc-300'
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
                  : 'border-[var(--border-subtle)] text-zinc-300'
              )}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {/* Toggle Editar */}
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        className="w-full h-9 rounded-lg border border-cyan-500/30 text-cyan-400 text-xs font-medium inline-flex items-center justify-center gap-1.5 hover:bg-cyan-500/10 transition-colors"
      >
        <Pencil className="h-3 w-3" />
        {editing ? 'Listo · Ocultar edición' : 'Editar antes de guardar'}
      </button>

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
          className={cn(
            'flex-[2] h-11 rounded-xl text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50',
            tipo === 'gasto' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
          )}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {pending ? 'Guardando' : 'Confirmar y guardar'}
        </button>
      </div>
    </div>
  )
}
