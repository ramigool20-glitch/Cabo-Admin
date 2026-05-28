'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CATEGORIAS_GASTO, CATEGORIAS_INGRESO, CATEGORIAS_CASA, METODOS_PAGO, metodoPagoDefault } from '@/lib/categorias'
import {
  createTransaccion,
  updateTransaccion,
  deleteTransaccion,
  type ActionState,
} from '@/app/(app)/transacciones/actions'
import { toast } from '@/components/ui/toast'
import { AvisoDuplicado } from '@/components/transacciones/aviso-duplicado'

export type NegocioOpt = { id: string; nombre: string; tipo: string; moneda_principal: string }
export type CuentaOpt  = { id: string; nombre: string; tipo: string | null; moneda: string }
export type SocioOpt   = { id: string; nombre: string }

export type TransaccionDefault = {
  id?: string
  tipo: 'ingreso' | 'gasto'
  monto?: string
  moneda?: 'MXN' | 'USD'
  fecha: string
  negocio_id?: string | null
  cuenta_id?: string | null
  metodo_pago?: string | null
  categoria?: string | null
  concepto?: string | null
  notas?: string | null
  monto_mxn_equivalente?: number | null
  tipo_cambio_usado?: number | null
  atribuido_a?: string | null
}

export function TransactionForm({
  negocios,
  cuentas,
  socios = [],
  defaults,
}: {
  negocios: NegocioOpt[]
  cuentas: CuentaOpt[]
  socios?: SocioOpt[]
  defaults: TransaccionDefault
}) {
  const router = useRouter()
  const isEdit = !!defaults.id

  const [tipo, setTipo] = useState<'ingreso' | 'gasto'>(defaults.tipo)
  const [moneda, setMoneda] = useState<'MXN' | 'USD'>(defaults.moneda ?? 'MXN')
  const [negocioId, setNegocioId] = useState<string>(defaults.negocio_id ?? '')
  const [cuentaId, setCuentaId] = useState<string>(defaults.cuenta_id ?? '')
  const [metodoPago, setMetodoPago] = useState<string>(defaults.metodo_pago ?? '')
  const [categoria, setCategoria] = useState<string>(defaults.categoria ?? '')
  const [atribuidoA, setAtribuidoA] = useState<string>(defaults.atribuido_a ?? '')
  const [mostrarMas, setMostrarMas] = useState(false)
  // Para detector de duplicados
  const [montoStr, setMontoStr] = useState<string>(defaults.monto ?? '')
  const [fecha, setFecha] = useState<string>(defaults.fecha)

  const action = isEdit
    ? updateTransaccion.bind(null, defaults.id!)
    : createTransaccion
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {})

  useEffect(() => {
    if (state.error) toast.error('No se pudo guardar', state.error)
  }, [state.error])

  // Cuando cambia la cuenta, sugerimos el método de pago
  const onCuentaChange = (id: string) => {
    setCuentaId(id)
    const c = cuentas.find((x) => x.id === id)
    if (!c) return
    const sugerido =
      c.tipo === 'efectivo'
        ? c.moneda === 'USD' ? 'efectivo_usd' : 'efectivo_mxn'
        : metodoPagoDefault(c.tipo)
    if (sugerido) setMetodoPago(sugerido)
    if (c.moneda === 'USD' || c.moneda === 'MXN') setMoneda(c.moneda as 'MXN' | 'USD')
  }

  // Si el negocio es Casa, sugerimos solo categorías de casa
  const negocioSel = negocios.find((n) => n.id === negocioId)
  const esCasa = negocioSel?.tipo === 'casa'

  const categorias = useMemo(() => {
    if (tipo === 'ingreso') return CATEGORIAS_INGRESO
    if (esCasa) return CATEGORIAS_CASA
    return CATEGORIAS_GASTO
  }, [tipo, esCasa])

  // Reset categoría si ya no es válida para el nuevo tipo/contexto
  useEffect(() => {
    if (categoria && !(categorias as readonly string[]).includes(categoria)) {
      setCategoria('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, esCasa])

  // Si cambias a Casa, default a "compartido" (NULL). Si sales de Casa, limpia atribución.
  useEffect(() => {
    if (!esCasa && atribuidoA) setAtribuidoA('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esCasa])

  const handleDelete = async () => {
    if (!defaults.id) return
    if (!confirm('¿Eliminar esta transacción?')) return
    await deleteTransaccion(defaults.id)
  }

  return (
    <form action={formAction} className="space-y-5">
      {/* Tipo */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
        <input type="hidden" name="tipo" value={tipo} />
        <button
          type="button"
          onClick={() => setTipo('gasto')}
          className={cn(
            'h-11 rounded-lg text-sm font-medium transition-colors',
            tipo === 'gasto'
              ? 'bg-red-600 text-white shadow'
              : 'text-zinc-600 dark:text-zinc-300'
          )}
        >
          Gasto
        </button>
        <button
          type="button"
          onClick={() => setTipo('ingreso')}
          className={cn(
            'h-11 rounded-lg text-sm font-medium transition-colors',
            tipo === 'ingreso'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-zinc-600 dark:text-zinc-300'
          )}
        >
          Ingreso
        </button>
      </div>

      {/* Monto + Moneda */}
      <div className="space-y-2">
        <label htmlFor="monto" className="text-sm font-medium">Monto</label>
        <div className="flex gap-2">
          <input
            id="monto"
            name="monto"
            type="text"
            inputMode="decimal"
            required
            value={montoStr}
            onChange={(e) => setMontoStr(e.target.value)}
            placeholder="0.00"
            className="flex-1 h-14 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-2xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            <input type="hidden" name="moneda" value={moneda} />
            {(['MXN', 'USD'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMoneda(m)}
                className={cn(
                  'h-12 w-14 rounded-lg text-sm font-bold transition-colors',
                  moneda === m
                    ? 'bg-[var(--bg-card)] text-white shadow'
                    : 'text-zinc-500'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        {moneda === 'USD' && defaults.monto_mxn_equivalente != null && defaults.tipo_cambio_usado != null && (
          <p className="text-[11px] text-cyan-400">
            Equivale a ${Number(defaults.monto_mxn_equivalente).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
            <span className="text-zinc-500"> · rate ${Number(defaults.tipo_cambio_usado).toFixed(2)} del {defaults.fecha}</span>
          </p>
        )}
      </div>

      {/* Negocio */}
      <div className="space-y-2">
        <label className="text-sm font-medium inline-flex items-center gap-2">
          Negocio
          {esCasa && <span className="chip chip-purple text-[9px] h-4 px-1.5">🏠 con atribución</span>}
        </label>
        <input type="hidden" name="negocio_id" value={negocioId} />
        <div className="flex flex-wrap gap-1.5">
          {negocios.map((n) => {
            const isCasaBtn = n.tipo === 'casa'
            const active = negocioId === n.id
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setNegocioId(n.id)}
                className={cn(
                  'h-9 px-3 rounded-full text-sm border transition-colors inline-flex items-center gap-1',
                  active
                    ? isCasaBtn
                      ? 'border-purple-500 bg-purple-500 text-white shadow-lg shadow-purple-500/30'
                      : 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-zinc-300'
                )}
              >
                {isCasaBtn && '🏠'}
                {n.nombre}
              </button>
            )
          })}
        </div>
      </div>

      {/* Cuenta */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Cuenta</label>
        <input type="hidden" name="cuenta_id" value={cuentaId} />
        <div className="flex flex-wrap gap-1.5">
          {cuentas.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onCuentaChange(c.id)}
              className={cn(
                'h-9 px-3 rounded-full text-sm border transition-colors',
                cuentaId === c.id
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-zinc-300'
              )}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Atribución (solo cuando es Casa) */}
      {esCasa && socios.length > 0 && (
        <div className="card-glow border-purple-500/40 bg-purple-500/5 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold text-purple-200 inline-flex items-center gap-1.5">
              🏠 ¿Es compartido o avance personal?
            </label>
          </div>
          <input type="hidden" name="atribuido_a" value={atribuidoA} />
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAtribuidoA('')}
              className={cn(
                'h-14 rounded-xl border-2 text-xs font-bold transition-all',
                atribuidoA === ''
                  ? 'border-cyan-400 bg-cyan-500 text-white shadow-lg shadow-cyan-500/30 scale-105'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-zinc-400 hover:border-cyan-500/50'
              )}
            >
              <span className="block text-xl">⚖️</span>
              <span className="block text-[10px] mt-0.5">Compartido</span>
            </button>
            {socios.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setAtribuidoA(s.id)}
                className={cn(
                  'h-14 rounded-xl border-2 text-xs font-bold transition-all',
                  atribuidoA === s.id
                    ? 'border-purple-400 bg-purple-500 text-white shadow-lg shadow-purple-500/30 scale-105'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-zinc-400 hover:border-purple-500/50'
                )}
              >
                <span className="block text-xl">💵</span>
                <span className="block text-[10px] mt-0.5 truncate">Avance {s.nombre}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-purple-200/70 px-1">
            {atribuidoA === ''
              ? '⚖ Compartido: gasto operativo de la sociedad. No se deduce a nadie.'
              : `💵 Avance de ${socios.find((s) => s.id === atribuidoA)?.nombre ?? '—'}: se deducirá de su utilidad al corte.`}
          </p>
        </div>
      )}

      {/* Concepto */}
      <div className="space-y-2">
        <label htmlFor="concepto" className="text-sm font-medium">Concepto</label>
        <input
          id="concepto"
          name="concepto"
          type="text"
          defaultValue={defaults.concepto ?? ''}
          placeholder="¿En qué fue?"
          className="w-full h-12 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Fecha */}
      <div className="space-y-2">
        <label htmlFor="fecha" className="text-sm font-medium">Fecha</label>
        <input
          id="fecha"
          name="fecha"
          type="date"
          required
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="w-full h-12 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Detector de duplicados */}
      <AvisoDuplicado
        tipo={tipo}
        monto={parseFloat(montoStr) || null}
        moneda={moneda}
        fecha={fecha || null}
        cuenta_id={cuentaId || null}
        ignorarTxId={defaults.id ?? null}
      />

      {/* Categoría VISIBLE directo */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Categoría</label>
        <input type="hidden" name="categoria" value={categoria} />
        <div className="flex flex-wrap gap-1.5">
          {categorias.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategoria(c)}
              className={cn(
                'h-8 px-3 rounded-full text-xs border transition-colors capitalize',
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

      {/* Método de pago */}
      <div className="space-y-2">
        <label htmlFor="metodo_pago" className="text-sm font-medium">Método de pago</label>
        <select
          id="metodo_pago"
          name="metodo_pago"
          value={metodoPago}
          onChange={(e) => setMetodoPago(e.target.value)}
          className="w-full h-12 px-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">(automático)</option>
          {METODOS_PAGO.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Más opciones (solo notas ahora) */}
      <button
        type="button"
        onClick={() => setMostrarMas((v) => !v)}
        className="text-sm text-cyan-400 font-medium"
      >
        {mostrarMas ? '− Menos' : '+ Notas opcionales'}
      </button>

      {mostrarMas && (
        <div className="space-y-5 pt-1">
          {/* Notas */}
          <div className="space-y-2">
            <label htmlFor="notas" className="text-sm font-medium">Notas</label>
            <textarea
              id="notas"
              name="notas"
              rows={3}
              defaultValue={defaults.notas ?? ''}
              placeholder="Opcional"
              className="w-full px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-base focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>
        </div>
      )}

      {/* Errores */}
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.fieldErrors && (
        <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside">
          {Object.entries(state.fieldErrors).map(([field, errs]) =>
            errs?.map((e) => <li key={field + e}>{e}</li>)
          )}
        </ul>
      )}

      {/* Botones */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 h-12 rounded-xl border border-[var(--border-subtle)] font-medium text-zinc-300"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className={cn(
            'flex-[2] h-12 rounded-xl text-white font-semibold disabled:opacity-50',
            tipo === 'gasto' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
          )}
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
          <Trash2 className="h-4 w-4" />
          Eliminar transacción
        </button>
      )}
    </form>
  )
}
