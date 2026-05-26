'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2, FileText } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { saveCuentaPorPagarFromAI } from '@/app/(app)/chat/save-action'
import { hoyEnCabos } from '@/lib/fechas'

export type Negocio = { id: string; nombre: string; tipo: string }

export type FacturaDraft = {
  proveedor: string
  concepto: string
  monto_total: number
  moneda: 'MXN' | 'USD'
  fecha_emision: string | null
  fecha_vencimiento: string | null
  negocio_sugerido: string | null
  categoria: string | null
  referencia: string | null
  documento_url: string | null
  notas: string | null
}

const CATEGORIAS = ['mercancía', 'servicios', 'materiales', 'renta', 'impuestos', 'reparación', 'otro']

function matchByNombre<T extends { nombre: string }>(items: T[], hint: string | null | undefined): T | undefined {
  if (!hint) return undefined
  const lower = hint.toLowerCase()
  return items.find((i) => i.nombre.toLowerCase().includes(lower) || lower.includes(i.nombre.toLowerCase()))
}

export function ConfirmFacturaCard({
  draft,
  negocios,
  onSaved,
  onCancel,
  onSwitchToTransaction,
}: {
  draft: FacturaDraft
  negocios: Negocio[]
  onSaved: (id: string) => void
  onCancel: () => void
  onSwitchToTransaction?: () => void
}) {
  const [proveedor, setProveedor] = useState(draft.proveedor)
  const [concepto, setConcepto] = useState(draft.concepto)
  const [monto, setMonto] = useState(String(draft.monto_total))
  const [moneda, setMoneda] = useState<'MXN' | 'USD'>(draft.moneda)
  const [fechaEmision, setFechaEmision] = useState(draft.fecha_emision || hoyEnCabos())
  const [fechaVencimiento, setFechaVencimiento] = useState(draft.fecha_vencimiento || '')
  const [negocioId, setNegocioId] = useState<string>(matchByNombre(negocios, draft.negocio_sugerido)?.id ?? '')
  const [categoria, setCategoria] = useState<string>(draft.categoria || '')
  const [referencia, setReferencia] = useState(draft.referencia || '')

  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const montoNum = Number(monto.replace(',', '.')) || 0

  const handleSave = () => {
    setError(null)
    if (!proveedor.trim()) { setError('Falta el nombre del proveedor'); return }
    if (!concepto.trim()) { setError('Falta el concepto'); return }
    if (montoNum <= 0) { setError('El monto debe ser mayor a 0'); return }

    startTransition(async () => {
      const res = await saveCuentaPorPagarFromAI({
        proveedor: proveedor.trim(),
        concepto: concepto.trim(),
        monto_total: montoNum,
        moneda,
        fecha_emision: fechaEmision || null,
        fecha_vencimiento: fechaVencimiento || null,
        negocio_id: negocioId || null,
        categoria: categoria || null,
        referencia: referencia.trim() || null,
        documento_url: draft.documento_url,
        notas: draft.notas,
      })
      if (!res.ok) {
        setError(res.error || 'Error guardando')
        return
      }
      if (res.id) onSaved(res.id)
    })
  }

  return (
    <div className="card-glow p-4 space-y-3 border-amber-500/40">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 text-amber-300 text-xs font-bold uppercase tracking-wide">
          <FileText className="h-3.5 w-3.5" />
          Factura por pagar
        </div>
        <p className="text-2xl font-bold tabular-nums text-amber-200">
          {formatMoney(montoNum, moneda)}
        </p>
      </div>

      <p className="text-[11px] text-zinc-500">
        La IA detectó esto como una factura sin pagar. Se creará en <strong>Por Pagar</strong>.
      </p>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-zinc-500">Proveedor *</label>
        <input
          type="text"
          value={proveedor}
          onChange={(e) => setProveedor(e.target.value)}
          placeholder="Ej: Suministros Cabo"
          className="input-base w-full text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-zinc-500">Concepto *</label>
        <input
          type="text"
          value={concepto}
          onChange={(e) => setConcepto(e.target.value)}
          placeholder="Ej: Factura #1234"
          className="input-base w-full text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Monto *</label>
          <div className="flex gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="input-base flex-1 text-sm font-bold tabular-nums"
            />
            <select
              value={moneda}
              onChange={(e) => setMoneda(e.target.value as 'MXN' | 'USD')}
              className="input-base w-16 text-xs"
            >
              <option value="MXN">MXN</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Vencimiento</label>
          <input
            type="date"
            value={fechaVencimiento}
            onChange={(e) => setFechaVencimiento(e.target.value)}
            className="input-base w-full text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-zinc-500">Negocio</label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setNegocioId('')}
            className={cn(
              'h-8 px-3 rounded-full text-xs border transition-colors',
              !negocioId
                ? 'border-zinc-500 bg-zinc-500/20 text-white'
                : 'border-[var(--border-subtle)] text-zinc-400'
            )}
          >
            Sin asignar
          </button>
          {negocios.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNegocioId(n.id)}
              className={cn(
                'h-8 px-3 rounded-full text-xs border transition-colors',
                negocioId === n.id
                  ? 'border-amber-500 bg-amber-500 text-white'
                  : 'border-[var(--border-subtle)] text-zinc-300'
              )}
            >
              {n.nombre}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-zinc-500">Categoría</label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIAS.map((c) => (
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

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-zinc-500">Referencia / folio</label>
        <input
          type="text"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
          placeholder="opcional"
          className="input-base w-full text-sm"
        />
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      {onSwitchToTransaction && (
        <button
          type="button"
          onClick={onSwitchToTransaction}
          className="w-full h-8 rounded-lg border border-zinc-700 text-[11px] text-zinc-400 hover:text-white"
        >
          No es factura, es un gasto ya pagado → cambiar
        </button>
      )}

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
          className="flex-[2] h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {pending ? 'Guardando' : 'Crear cuenta por pagar'}
        </button>
      </div>
    </div>
  )
}
