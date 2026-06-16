'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Trash2, Camera, X, Image as ImageIcon } from 'lucide-react'
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
  fotoExistenteUrl = null,
}: {
  negocios: NegocioOpt[]
  cuentas: CuentaOpt[]
  socios?: SocioOpt[]
  defaults: TransaccionDefault
  /** Signed URL de la foto ya guardada (al editar). Si es null no hay foto. */
  fotoExistenteUrl?: string | null
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
  // Pago dividido en 2 cuentas (solo al crear)
  const [splitActivo, setSplitActivo] = useState(false)
  const [cuentaId2, setCuentaId2] = useState<string>('')
  const [metodoPago2, setMetodoPago2] = useState<string>('')
  const [monto1Str, setMonto1Str] = useState<string>('')

  // Concepto controlado + sugerencia IA
  const [conceptoStr, setConceptoStr] = useState<string>(defaults.concepto ?? '')
  type SugerenciaIA = {
    categoria: string | null
    negocio_id: string | null
    negocio_nombre: string | null
    cuenta_id: string | null
    cuenta_nombre: string | null
    metodo_pago: string | null
    confianza: 'alta' | 'media' | 'baja'
    fuente: 'historico_exacto' | 'historico_fuzzy' | 'ia'
    ejemplos_count: number
  }
  const [sugerencia, setSugerencia] = useState<SugerenciaIA | null>(null)
  const [sugLoading, setSugLoading] = useState(false)
  const [sugDescartada, setSugDescartada] = useState(false)

  // Foto opcional de evidencia
  // Usamos 2 inputs file separados: uno para cámara (capture=environment) y otro
  // para galería/archivos (sin capture). El de galería es el "principal" con
  // name="foto" para que el form lo envíe. Si el usuario captura desde la cámara,
  // copiamos el archivo al input principal via DataTransfer.
  const fotoInputRef = useRef<HTMLInputElement | null>(null) // galería — el que envía
  const camInputRef = useRef<HTMLInputElement | null>(null)  // cámara — auxiliar
  const [fotoPreview, setFotoPreview] = useState<string | null>(null) // dataURL local
  const [quitarFotoExistente, setQuitarFotoExistente] = useState(false)
  const fotoVisible = fotoPreview ?? (quitarFotoExistente ? null : fotoExistenteUrl)

  const onFotoChange = (file: File | null) => {
    if (!file) { setFotoPreview(null); return }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Foto muy grande', 'Máximo 10 MB')
      if (fotoInputRef.current) fotoInputRef.current.value = ''
      if (camInputRef.current) camInputRef.current.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => setFotoPreview(typeof reader.result === 'string' ? reader.result : null)
    reader.readAsDataURL(file)
    setQuitarFotoExistente(false)
  }

  // Cuando el usuario toma la foto desde la CÁMARA, copiamos el archivo al input
  // principal (galería) para que el form submit lo envíe con name="foto".
  const onCamCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    if (!file) { onFotoChange(null); return }
    if (fotoInputRef.current && typeof DataTransfer !== 'undefined') {
      try {
        const dt = new DataTransfer()
        dt.items.add(file)
        fotoInputRef.current.files = dt.files
      } catch {
        // Algunos browsers no permiten setear files. El handler de submit se
        // encargará igual leyendo de e.target.files del input camera.
      }
    }
    onFotoChange(file)
  }

  const quitarFoto = () => {
    setFotoPreview(null)
    if (fotoInputRef.current) fotoInputRef.current.value = ''
    if (camInputRef.current) camInputRef.current.value = ''
    if (fotoExistenteUrl) setQuitarFotoExistente(true)
  }

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
    // Si la 2da cuenta del split queda igual, la liberamos
    if (splitActivo && cuentaId2 === id) setCuentaId2('')
    const c = cuentas.find((x) => x.id === id)
    if (!c) return
    const sugerido =
      c.tipo === 'efectivo'
        ? c.moneda === 'USD' ? 'efectivo_usd' : 'efectivo_mxn'
        : metodoPagoDefault(c.tipo)
    if (sugerido) setMetodoPago(sugerido)
    if (c.moneda === 'USD' || c.moneda === 'MXN') setMoneda(c.moneda as 'MXN' | 'USD')
  }

  // Selección de cuenta 2 (split)
  const onCuenta2Change = (id: string) => {
    if (id === cuentaId) return // no puede ser la misma
    setCuentaId2(id)
    const c = cuentas.find((x) => x.id === id)
    if (!c) return
    const sugerido =
      c.tipo === 'efectivo'
        ? c.moneda === 'USD' ? 'efectivo_usd' : 'efectivo_mxn'
        : metodoPagoDefault(c.tipo)
    if (sugerido) setMetodoPago2(sugerido)
  }

  // Cálculo en vivo del split
  const montoTotal = parseFloat(montoStr) || 0
  const monto1 = parseFloat(monto1Str) || 0
  const monto2 = Math.max(0, Number((montoTotal - monto1).toFixed(2)))
  const splitOk =
    splitActivo &&
    montoTotal > 0 &&
    monto1 > 0 &&
    monto1 < montoTotal &&
    !!cuentaId2 &&
    cuentaId !== cuentaId2

  // Si se desactiva el split o cambia el monto a 0, limpiar
  useEffect(() => {
    if (!splitActivo) { setCuentaId2(''); setMetodoPago2(''); setMonto1Str('') }
  }, [splitActivo])

  // Sugerencia IA: pide al backend cuando el concepto tiene ≥4 chars (debounce 600ms)
  useEffect(() => {
    if (isEdit) return // sugerencias solo al crear
    setSugDescartada(false)
    const trimmed = conceptoStr.trim()
    if (trimmed.length < 4) { setSugerencia(null); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setSugLoading(true)
      try {
        const res = await fetch('/api/ai/sugerir-categorizacion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ concepto: trimmed, tipo, monto: parseFloat(montoStr) || undefined }),
          signal: ctrl.signal,
        })
        if (res.ok) {
          const json = await res.json()
          setSugerencia(json.sugerencia ?? null)
        }
      } catch { /* ignore aborts */ }
      finally { setSugLoading(false) }
    }, 600)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [conceptoStr, tipo, isEdit, montoStr])

  function aplicarSugerencia() {
    if (!sugerencia) return
    if (sugerencia.categoria) setCategoria(sugerencia.categoria)
    if (sugerencia.negocio_id) setNegocioId(sugerencia.negocio_id)
    if (sugerencia.cuenta_id) onCuentaChange(sugerencia.cuenta_id)
    if (sugerencia.metodo_pago) setMetodoPago(sugerencia.metodo_pago)
    setSugDescartada(true)
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
            className="flex-1 min-w-0 h-14 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-2xl font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="shrink-0 grid grid-cols-2 gap-0.5 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            <input type="hidden" name="moneda" value={moneda} />
            {(['MXN', 'USD'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMoneda(m)}
                className={cn(
                  'h-12 w-12 rounded-lg text-xs font-bold transition-colors',
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

      {/* Cuenta (1 si hay split) */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          {splitActivo ? 'Cuenta 1' : 'Cuenta'}
        </label>
        <input type="hidden" name="cuenta_id" value={cuentaId} />
        <div className="flex flex-wrap gap-1.5">
          {cuentas.map((c) => {
            const usadaEnSplit = splitActivo && cuentaId2 === c.id
            return (
              <button
                key={c.id}
                type="button"
                disabled={usadaEnSplit}
                onClick={() => onCuentaChange(c.id)}
                className={cn(
                  'h-9 px-3 rounded-full text-sm border transition-colors',
                  cuentaId === c.id
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : usadaEnSplit
                      ? 'border-zinc-800 bg-zinc-900 text-zinc-600 cursor-not-allowed'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-zinc-300'
                )}
              >
                {c.nombre}
                {usadaEnSplit && ' (cuenta 2)'}
              </button>
            )
          })}
        </div>
      </div>

      {/* Toggle "Pago dividido en 2 cuentas" — solo al crear */}
      {!isEdit && (
        <div className="space-y-2">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={splitActivo}
              onChange={(e) => setSplitActivo(e.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
            <span className="text-sm font-medium text-zinc-300">
              💳 Pago dividido en 2 cuentas
              <span className="ml-1 text-[11px] text-zinc-500">(efectivo + tarjeta, etc.)</span>
            </span>
          </label>
          {splitActivo && (
            <input type="hidden" name="split_activo" value="1" />
          )}
        </div>
      )}

      {/* Bloque split: cuenta 2 + montos */}
      {!isEdit && splitActivo && (
        <div className="card-glow border-cyan-500/40 bg-cyan-500/5 p-3 space-y-3">
          <p className="text-xs font-bold text-cyan-200 inline-flex items-center gap-1.5">
            💳 División del pago — total {moneda} {montoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>

          {/* Montos por cuenta */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="label-caps">$ Cuenta 1</label>
              <input
                name="monto_1"
                type="text"
                inputMode="decimal"
                value={monto1Str}
                onChange={(e) => setMonto1Str(e.target.value)}
                placeholder="0.00"
                className="input-base w-full h-10 text-sm tabular-nums font-bold"
              />
            </div>
            <div className="space-y-1">
              <label className="label-caps">$ Cuenta 2 (auto)</label>
              <div className="h-10 flex items-center px-3 rounded-xl border border-[var(--border-subtle)] bg-black/30 text-sm tabular-nums font-bold text-cyan-200">
                {monto2.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Validación visible */}
          {montoTotal <= 0 && (
            <p className="text-[11px] text-amber-300">⚠️ Captura primero el Monto total arriba.</p>
          )}
          {montoTotal > 0 && monto1 <= 0 && (
            <p className="text-[11px] text-amber-300">Escribe cuánto se pagó con la cuenta 1.</p>
          )}
          {montoTotal > 0 && monto1 >= montoTotal && (
            <p className="text-[11px] text-rose-400">El monto de cuenta 1 debe ser menor al total.</p>
          )}

          {/* Selector Cuenta 2 */}
          <div className="space-y-1.5">
            <label className="label-caps">Cuenta 2</label>
            <input type="hidden" name="cuenta_id_2" value={cuentaId2} />
            <div className="flex flex-wrap gap-1.5">
              {cuentas.map((c) => {
                const usadaEn1 = cuentaId === c.id
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={usadaEn1}
                    onClick={() => onCuenta2Change(c.id)}
                    className={cn(
                      'h-9 px-3 rounded-full text-sm border transition-colors',
                      cuentaId2 === c.id
                        ? 'border-cyan-500 bg-cyan-500 text-white'
                        : usadaEn1
                          ? 'border-zinc-800 bg-zinc-900 text-zinc-600 cursor-not-allowed'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-zinc-300'
                    )}
                  >
                    {c.nombre}
                    {usadaEn1 && ' (cuenta 1)'}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Método de pago de la cuenta 2 (opcional) */}
          <div className="space-y-1.5">
            <label className="label-caps">Método cuenta 2 (opcional)</label>
            <input type="hidden" name="metodo_pago_2" value={metodoPago2} />
            <div className="flex flex-wrap gap-1.5">
              {METODOS_PAGO.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMetodoPago2(metodoPago2 === m.value ? '' : m.value)}
                  className={cn(
                    'h-8 px-3 rounded-full text-[11px] border transition-colors',
                    metodoPago2 === m.value
                      ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-zinc-400'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">
            Se crean 2 transacciones (una por cuenta) ligadas con un mismo grupo. Editar/eliminar es independiente por cuenta.
          </p>
        </div>
      )}

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

      {/* Concepto + sugerencia IA */}
      <div className="space-y-2">
        <label htmlFor="concepto" className="text-sm font-medium">Concepto</label>
        <input
          id="concepto"
          name="concepto"
          type="text"
          value={conceptoStr}
          onChange={(e) => setConceptoStr(e.target.value)}
          placeholder="¿En qué fue?"
          className="w-full h-12 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {!isEdit && sugLoading && (
          <p className="text-[10px] text-zinc-500 inline-flex items-center gap-1">⏳ Buscando sugerencia…</p>
        )}
        {!isEdit && !sugDescartada && sugerencia && (sugerencia.categoria || sugerencia.negocio_id || sugerencia.cuenta_id) && (
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-base shrink-0">🤖</span>
              <div className="flex-1 leading-tight">
                <p className="text-[11px] font-bold text-cyan-200">
                  Sugerencia · {sugerencia.confianza === 'alta' ? '✓ alta' : sugerencia.confianza === 'media' ? 'media' : 'baja'} confianza
                  <span className="text-[10px] text-cyan-300/60 ml-1">
                    ({sugerencia.fuente === 'historico_exacto' ? 'match exacto' : sugerencia.fuente === 'historico_fuzzy' ? `${sugerencia.ejemplos_count} similares` : 'IA'})
                  </span>
                </p>
                <p className="text-[11px] text-zinc-300 mt-0.5">
                  {[
                    sugerencia.categoria && `📂 ${sugerencia.categoria}`,
                    sugerencia.negocio_nombre && `🏢 ${sugerencia.negocio_nombre}`,
                    sugerencia.cuenta_nombre && `💳 ${sugerencia.cuenta_nombre}`,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={aplicarSugerencia}
                className="flex-1 h-8 rounded-lg bg-cyan-500 text-white text-[11px] font-bold"
              >
                ✓ Aplicar
              </button>
              <button
                type="button"
                onClick={() => setSugDescartada(true)}
                className="h-8 px-2.5 rounded-lg border border-zinc-700 text-zinc-400 text-[11px]"
              >
                Descartar
              </button>
            </div>
          </div>
        )}
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

      {/* Foto de evidencia (opcional) */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Foto de evidencia <span className="text-zinc-500 font-normal">(opcional)</span></label>

        {/* Input principal (galería/archivos) — el que envía con name="foto" */}
        <input
          ref={fotoInputRef}
          type="file"
          name="foto"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFotoChange(e.target.files?.[0] ?? null)}
        />
        {/* Input auxiliar (cámara) — capture fuerza abrir cámara en iOS */}
        <input
          ref={camInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onCamCapture}
        />
        {quitarFotoExistente && <input type="hidden" name="foto_quitar" value="1" />}

        {fotoVisible ? (
          <div className="relative rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-input)]">
            <Image
              src={fotoVisible}
              alt="Evidencia"
              width={640}
              height={480}
              unoptimized
              className="w-full h-auto max-h-64 object-contain"
            />
            <button
              type="button"
              onClick={quitarFoto}
              aria-label="Quitar foto"
              className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white inline-flex items-center justify-center backdrop-blur"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="absolute bottom-2 right-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => camInputRef.current?.click()}
                className="h-8 px-3 rounded-full bg-black/60 text-white text-xs inline-flex items-center gap-1.5 backdrop-blur"
              >
                <Camera className="h-3.5 w-3.5" />
                Cámara
              </button>
              <button
                type="button"
                onClick={() => fotoInputRef.current?.click()}
                className="h-8 px-3 rounded-full bg-black/60 text-white text-xs inline-flex items-center gap-1.5 backdrop-blur"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                Galería
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => camInputRef.current?.click()}
              className="h-14 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm text-zinc-300 inline-flex items-center justify-center gap-2 hover:border-emerald-500/40 hover:text-emerald-300"
            >
              <Camera className="h-4 w-4" />
              Cámara
            </button>
            <button
              type="button"
              onClick={() => fotoInputRef.current?.click()}
              className="h-14 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm text-zinc-300 inline-flex items-center justify-center gap-2 hover:border-cyan-500/40 hover:text-cyan-300"
            >
              <ImageIcon className="h-4 w-4" />
              Galería
            </button>
          </div>
        )}
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
          disabled={pending || (splitActivo && !splitOk)}
          className={cn(
            'flex-[2] h-12 rounded-xl text-white font-semibold disabled:opacity-50',
            tipo === 'gasto' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
          )}
        >
          {pending ? 'Guardando…' : isEdit ? 'Guardar cambios' : splitActivo ? 'Guardar (2 transacciones)' : 'Guardar'}
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
