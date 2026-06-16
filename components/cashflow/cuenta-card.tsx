'use client'

import { useActionState, useState, useEffect } from 'react'
import { Wallet, Lock, Pencil, Loader2, ChevronDown, X, Save, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/utils'
import { hoyEnCabos, formatearFecha } from '@/lib/fechas'
import { toast } from '@/components/ui/toast'
import { capturarSaldoInicial, crearAjusteSaldo, editarSaldoInicial, type ActionState } from '@/app/(app)/cashflow/actions'

const TIPO_EMOJI: Record<string, string> = {
  mercado_pago: '🛒',
  stripe: '💳',
  banco: '🏦',
  efectivo: '💵',
  tarjeta: '💳',
  otra: '💰',
}

export type Cuenta = {
  id: string
  nombre: string
  titular: string | null
  tipo: string
  moneda: 'MXN' | 'USD'
  saldo_inicial_mxn: number
  saldo_inicial_usd: number
  saldo_inicial_fecha: string | null
  saldo_inicial_locked: boolean
  saldo_inicial_notas: string | null
}

export type CuentaMovsSummary = {
  ingresos_mxn: number
  ingresos_usd: number
  gastos_mxn: number
  gastos_usd: number
}

/** Saldo real reportado por la API de Mercado Pago (si la cuenta está integrada). */
export type SaldoMpReal = {
  integ_id: string
  disponible: number | null
  pendiente: number | null
  moneda: 'MXN' | 'USD'
  actualizado_at: string | null
  error: string | null
}

export function CuentaCard({
  cuenta,
  movs,
  fxRate,
  saldoMpReal = null,
}: {
  cuenta: Cuenta
  movs: CuentaMovsSummary
  fxRate: number | null
  saldoMpReal?: SaldoMpReal | null
}) {
  const tieneSaldoInicial = cuenta.saldo_inicial_locked

  // Cálculo de saldos actuales
  const saldoMxn = Number(cuenta.saldo_inicial_mxn) + movs.ingresos_mxn - movs.gastos_mxn
  const saldoUsd = Number(cuenta.saldo_inicial_usd) + movs.ingresos_usd - movs.gastos_usd
  const totalEquivMxn = saldoMxn + (saldoUsd * (fxRate ?? 17))

  if (!tieneSaldoInicial) {
    return <CapturarInicialCard cuenta={cuenta} />
  }

  return <CuentaActivaCard cuenta={cuenta} movs={movs} saldoMxn={saldoMxn} saldoUsd={saldoUsd} totalEquivMxn={totalEquivMxn} fxRate={fxRate} saldoMpReal={saldoMpReal} />
}

function CapturarInicialCard({ cuenta }: { cuenta: Cuenta }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(capturarSaldoInicial, {})

  useEffect(() => {
    if (state.ok) {
      toast.success('Saldo inicial capturado', 'Ahora está bloqueado')
      setOpen(false)
    } else if (state.error) {
      toast.error('No se pudo capturar', state.error)
    }
  }, [state])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card border-amber-500/40 bg-amber-500/5 w-full p-4 flex items-center gap-3 hover:bg-amber-500/10 transition-colors"
      >
        <span className="h-10 w-10 rounded-xl inline-flex items-center justify-center bg-amber-500/20 border border-amber-500/40 text-lg">
          {TIPO_EMOJI[cuenta.tipo] ?? '💰'}
        </span>
        <div className="flex-1 text-left leading-tight">
          <p className="text-sm font-bold text-white">{cuenta.nombre}</p>
          <p className="text-[11px] text-amber-300 inline-flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Sin saldo inicial capturado
          </p>
        </div>
        <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">
          Capturar →
        </span>
      </button>
    )
  }

  return (
    <form action={formAction} className="card-glow border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
      <input type="hidden" name="cuenta_id" value={cuenta.id} />

      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-amber-300 inline-flex items-center gap-2">
          {TIPO_EMOJI[cuenta.tipo] ?? '💰'} Capturar saldo inicial de {cuenta.nombre}
        </p>
        <button type="button" onClick={() => setOpen(false)} className="h-7 w-7 text-zinc-500 hover:text-white inline-flex items-center justify-center">
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="text-[11px] text-amber-200/80 leading-snug">
        Este saldo se capturará una sola vez. Después se bloqueará 🔒 y solo se podrá ajustar mediante una transacción con motivo. Sé exacto.
      </p>

      <div className="space-y-2">
        <label className="label-caps">Fecha del saldo</label>
        <input
          name="fecha"
          type="date"
          required
          defaultValue={hoyEnCabos()}
          className="input-base w-full h-10 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          <label className="label-caps">Saldo MXN</label>
          <input
            name="saldo_inicial_mxn"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={cuenta.moneda === 'MXN' ? '' : '0'}
            className="input-base w-full h-10 text-sm font-bold tabular-nums"
          />
        </div>
        <div className="space-y-2">
          <label className="label-caps">Saldo USD</label>
          <input
            name="saldo_inicial_usd"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={cuenta.moneda === 'USD' ? '' : '0'}
            className="input-base w-full h-10 text-sm font-bold tabular-nums"
          />
        </div>
      </div>

      <p className="text-[10px] text-zinc-500">
        Si la cuenta solo maneja una moneda, deja la otra en 0.
      </p>

      <div className="space-y-2">
        <label className="label-caps">Notas (opcional)</label>
        <textarea
          name="notas"
          rows={2}
          placeholder="Ej: saldo verificado contra app del banco hoy 27 may"
          className="input-base w-full text-sm !h-auto py-2 resize-none"
        />
      </div>

      {state.error && <p className="text-sm text-rose-400">{state.error}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost flex-1 h-10 text-sm">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="btn-primary flex-[2] h-10 text-sm">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          {pending ? 'Capturando…' : 'Capturar y bloquear'}
        </button>
      </div>
    </form>
  )
}

function CuentaActivaCard({
  cuenta,
  movs,
  saldoMxn,
  saldoUsd,
  totalEquivMxn,
  fxRate,
  saldoMpReal,
}: {
  cuenta: Cuenta
  movs: CuentaMovsSummary
  saldoMxn: number
  saldoUsd: number
  totalEquivMxn: number
  fxRate: number | null
  saldoMpReal: SaldoMpReal | null
}) {
  const [showDetalle, setShowDetalle] = useState(false)
  const [showAjuste, setShowAjuste] = useState(false)
  const [showEditarInicial, setShowEditarInicial] = useState(false)
  const tieneMxn = saldoMxn !== 0 || Number(cuenta.saldo_inicial_mxn) !== 0
  const tieneUsd = saldoUsd !== 0 || Number(cuenta.saldo_inicial_usd) !== 0
  // Siempre muestra la moneda principal de la cuenta (aunque saldo sea $0)
  const mostrarMxn = tieneMxn || cuenta.moneda === 'MXN'
  const mostrarUsd = tieneUsd || cuenta.moneda === 'USD'
  const saldoNegativo = (mostrarMxn && saldoMxn < 0) || (mostrarUsd && saldoUsd < 0)

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 rounded-xl inline-flex items-center justify-center bg-[var(--bg-input)] text-lg shrink-0">
          {TIPO_EMOJI[cuenta.tipo] ?? '💰'}
        </span>
        <div className="flex-1 min-w-0 leading-tight">
          <p className="text-sm font-bold text-white truncate">{cuenta.nombre}</p>
          {cuenta.titular && <p className="text-[10px] text-zinc-500">{cuenta.titular}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowEditarInicial((v) => !v)}
            className="h-8 px-2 rounded-md text-[10px] font-bold inline-flex items-center gap-1 border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            title="Corregir saldo inicial"
          >
            <Lock className="h-3 w-3" />
            Inicial
          </button>
          <button
            type="button"
            onClick={() => setShowAjuste((v) => !v)}
            className="h-8 px-2 rounded-md text-[10px] font-bold inline-flex items-center gap-1 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10"
            title="Registrar entrada/salida con motivo"
          >
            <Pencil className="h-3 w-3" />
            Ajustar
          </button>
        </div>
      </div>

      {/* Saldos — siempre muestra la moneda principal aunque sea $0 */}
      <div className="space-y-1 pl-13">
        {mostrarMxn && (
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
              {saldoMxn < 0 ? 'MXN · DEBE' : 'MXN'}
            </span>
            <span className={cn('text-lg font-black tabular-nums', saldoMxn >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
              {formatMoney(saldoMxn, 'MXN')}
            </span>
          </div>
        )}
        {mostrarUsd && (
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
              {saldoUsd < 0 ? 'USD · DEBE' : 'USD'}
            </span>
            <span className={cn('text-lg font-black tabular-nums', saldoUsd >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
              {formatMoney(saldoUsd, 'USD')}
            </span>
          </div>
        )}
        {/* Equivalente MXN: siempre que tenga USD */}
        {mostrarUsd && saldoUsd !== 0 && (
          <div className="flex items-baseline justify-between pt-1 border-t border-zinc-800">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">
              {mostrarMxn && saldoMxn !== 0 ? 'Total equiv.' : 'Equivalente'}
            </span>
            <span className={cn('text-base font-black tabular-nums', totalEquivMxn >= 0 ? 'text-cyan-300' : 'text-rose-300')}>
              ≈ {formatMoney(totalEquivMxn, 'MXN')}
            </span>
          </div>
        )}
        {saldoNegativo && (
          <p className="text-[10px] text-rose-300/80 italic pt-0.5">
            ⚠ Sobregiro: los gastos posteriores al saldo inicial exceden lo capturado
          </p>
        )}
      </div>

      {/* Saldo real reportado por MP (si la cuenta tiene integración) */}
      {saldoMpReal && (
        <SaldoMpComparativo
          saldoMpReal={saldoMpReal}
          saldoCalculado={cuenta.moneda === 'USD' ? saldoUsd : saldoMxn}
        />
      )}

      {/* Toggle detalle */}
      <button
        type="button"
        onClick={() => setShowDetalle((v) => !v)}
        className="text-[10px] text-zinc-500 inline-flex items-center gap-1 hover:text-cyan-400"
      >
        <ChevronDown className={cn('h-3 w-3 transition-transform', showDetalle && 'rotate-180')} />
        {showDetalle ? 'Ocultar detalle' : 'Ver desglose'}
      </button>

      {showDetalle && (
        <div className="rounded-lg bg-black/30 p-2 space-y-1 text-[11px]">
          <p className="text-zinc-400 inline-flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Inicial {cuenta.saldo_inicial_fecha && `(${formatearFecha(cuenta.saldo_inicial_fecha, 'dd MMM yyyy')})`}:
            {Number(cuenta.saldo_inicial_mxn) !== 0 && <span className="ml-1 tabular-nums">{formatMoney(Number(cuenta.saldo_inicial_mxn), 'MXN')}</span>}
            {Number(cuenta.saldo_inicial_usd) !== 0 && <span className="ml-1 tabular-nums">{formatMoney(Number(cuenta.saldo_inicial_usd), 'USD')}</span>}
          </p>
          {(movs.ingresos_mxn > 0 || movs.ingresos_usd > 0) && (
            <p className="text-emerald-400 inline-flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3" />
              Ingresos posteriores:
              {movs.ingresos_mxn > 0 && <span className="tabular-nums">{formatMoney(movs.ingresos_mxn, 'MXN')}</span>}
              {movs.ingresos_usd > 0 && <span className="tabular-nums">{formatMoney(movs.ingresos_usd, 'USD')}</span>}
            </p>
          )}
          {(movs.gastos_mxn > 0 || movs.gastos_usd > 0) && (
            <p className="text-rose-400 inline-flex items-center gap-1">
              <ArrowDownRight className="h-3 w-3" />
              Gastos posteriores:
              {movs.gastos_mxn > 0 && <span className="tabular-nums">{formatMoney(movs.gastos_mxn, 'MXN')}</span>}
              {movs.gastos_usd > 0 && <span className="tabular-nums">{formatMoney(movs.gastos_usd, 'USD')}</span>}
            </p>
          )}
          {cuenta.saldo_inicial_notas && (
            <p className="text-zinc-500 italic mt-1">📝 {cuenta.saldo_inicial_notas}</p>
          )}
        </div>
      )}

      {/* Form de editar inicial */}
      {showEditarInicial && (
        <EditarInicialForm
          cuenta={cuenta}
          onClose={() => setShowEditarInicial(false)}
        />
      )}

      {/* Form de ajuste */}
      {showAjuste && (
        <AjusteForm
          cuenta={cuenta}
          onClose={() => setShowAjuste(false)}
        />
      )}
    </div>
  )
}

function EditarInicialForm({ cuenta, onClose }: { cuenta: Cuenta; onClose: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(editarSaldoInicial, {})

  useEffect(() => {
    if (state.ok) {
      toast.success('Saldo inicial corregido', 'Las tx después de la fecha se contarán')
      onClose()
    } else if (state.error) {
      toast.error('No se pudo', state.error)
    }
  }, [state, onClose])

  return (
    <form action={formAction} className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
      <input type="hidden" name="cuenta_id" value={cuenta.id} />

      <p className="text-xs font-bold text-amber-300 inline-flex items-center gap-1">
        <Pencil className="h-3 w-3" />
        Corregir saldo inicial
      </p>
      <p className="text-[10px] text-amber-200/80 leading-snug">
        Esto sobreescribe el saldo capturado. Las transacciones <strong>posteriores</strong> a la fecha contarán; las anteriores ya están en el saldo.
      </p>

      <div className="space-y-1">
        <label className="label-caps">Fecha del saldo</label>
        <input
          name="fecha"
          type="date"
          required
          defaultValue={cuenta.saldo_inicial_fecha ?? hoyEnCabos()}
          className="input-base w-full h-9 text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="label-caps">Saldo MXN</label>
          <input
            name="saldo_inicial_mxn"
            type="text"
            inputMode="decimal"
            defaultValue={Number(cuenta.saldo_inicial_mxn ?? 0)}
            className="input-base w-full h-9 text-xs font-bold tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <label className="label-caps">Saldo USD</label>
          <input
            name="saldo_inicial_usd"
            type="text"
            inputMode="decimal"
            defaultValue={Number(cuenta.saldo_inicial_usd ?? 0)}
            className="input-base w-full h-9 text-xs font-bold tabular-nums"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="label-caps">Notas</label>
        <input
          name="notas"
          type="text"
          defaultValue={cuenta.saldo_inicial_notas ?? ''}
          placeholder="ej: corregido contra app del banco"
          className="input-base w-full h-9 text-xs"
        />
      </div>

      {state.error && <p className="text-xs text-rose-400">{state.error}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="btn-ghost flex-1 h-9 text-xs">Cancelar</button>
        <button type="submit" disabled={pending} className="btn-primary flex-[2] h-9 text-xs">
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Guardar corrección
        </button>
      </div>
    </form>
  )
}

function AjusteForm({ cuenta, onClose }: { cuenta: Cuenta; onClose: () => void }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(crearAjusteSaldo, {})
  const [tipo, setTipo] = useState<'entrada' | 'salida'>('salida')
  const [moneda, setMoneda] = useState<'MXN' | 'USD'>(cuenta.moneda)

  useEffect(() => {
    if (state.ok) {
      toast.success('Ajuste registrado', 'Aparece en transacciones')
      onClose()
    } else if (state.error) {
      toast.error('No se pudo ajustar', state.error)
    }
  }, [state, onClose])

  return (
    <form action={formAction} className="rounded-xl border border-cyan-500/40 bg-cyan-500/5 p-3 space-y-2">
      <input type="hidden" name="cuenta_id" value={cuenta.id} />
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="moneda" value={moneda} />

      <p className="text-xs font-bold text-cyan-300">Ajustar saldo de {cuenta.nombre}</p>
      <p className="text-[10px] text-zinc-500">Esto crea una transacción de ajuste con tu motivo. Saldo se actualiza automático.</p>

      <div className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-[var(--bg-input)]">
        <button
          type="button"
          onClick={() => setTipo('entrada')}
          className={cn('h-8 rounded text-[11px] font-bold inline-flex items-center justify-center gap-1', tipo === 'entrada' ? 'bg-emerald-500 text-white' : 'text-zinc-400')}
        >
          <ArrowUpRight className="h-3 w-3" />
          Entrada
        </button>
        <button
          type="button"
          onClick={() => setTipo('salida')}
          className={cn('h-8 rounded text-[11px] font-bold inline-flex items-center justify-center gap-1', tipo === 'salida' ? 'bg-rose-500 text-white' : 'text-zinc-400')}
        >
          <ArrowDownRight className="h-3 w-3" />
          Salida
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label-caps">Monto</label>
          <input name="monto" type="text" inputMode="decimal" required placeholder="0.00" className="input-base w-full h-9 text-xs font-bold tabular-nums" />
        </div>
        <div>
          <label className="label-caps">Moneda</label>
          <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-md bg-[var(--bg-input)] border border-[var(--border-subtle)] h-9">
            {(['MXN', 'USD'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMoneda(m)}
                className={cn('rounded text-[10px] font-bold', moneda === m ? 'bg-cyan-500 text-white' : 'text-zinc-500')}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="label-caps">Fecha</label>
        <input name="fecha" type="date" required defaultValue={hoyEnCabos()} className="input-base w-full h-9 text-xs" />
      </div>

      <div>
        <label className="label-caps">Motivo (obligatorio)</label>
        <textarea
          name="motivo"
          required
          rows={2}
          placeholder="Ej: comisión bancaria, intereses recibidos, cargo no registrado…"
          className="input-base w-full text-xs !h-auto py-2 resize-none"
        />
      </div>

      {state.error && <p className="text-xs text-rose-400">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full h-9 text-xs">
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        Registrar ajuste
      </button>
    </form>
  )
}

/**
 * Bloque que compara el saldo CALCULADO por la app vs el saldo REAL que reporta
 * la API de Mercado Pago. Si la diferencia es mayor a $50, muestra link a la
 * pantalla de "movimientos no capturados" para conciliar.
 */
function SaldoMpComparativo({
  saldoMpReal,
  saldoCalculado,
}: {
  saldoMpReal: SaldoMpReal
  saldoCalculado: number
}) {
  if (saldoMpReal.error) {
    // 403 / 404 son errores conocidos del endpoint MP que aún no expone saldo
    // públicamente. Lo mostramos suave como nota informativa, no como error rojo.
    const es403o404 = /\b(403|404)\b/.test(saldoMpReal.error)
    if (es403o404) {
      return (
        <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/30 p-2 flex items-center gap-1.5">
          <span className="text-[14px]">🔗</span>
          <p className="text-[10px] text-zinc-400 leading-tight">
            Saldo MP en vivo pendiente — endpoint no expuesto aún por MP. El saldo calculado abajo está al día por polling.
          </p>
        </div>
      )
    }
    return (
      <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5 flex items-start gap-2">
        <AlertCircle className="h-3.5 w-3.5 text-rose-400 mt-0.5 shrink-0" />
        <div className="leading-tight">
          <p className="text-[10px] text-rose-200 uppercase font-bold tracking-wider">Saldo MP no disponible</p>
          <p className="text-[11px] text-rose-300/80 font-mono">{saldoMpReal.error}</p>
        </div>
      </div>
    )
  }

  if (saldoMpReal.disponible === null) {
    return (
      <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-2.5">
        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Saldo MP</p>
        <p className="text-[11px] text-zinc-400">Aún sin sincronizar. El cron lo trae cada hora.</p>
      </div>
    )
  }

  const real = Number(saldoMpReal.disponible)
  const diferencia = Number((saldoCalculado - real).toFixed(2))
  const hayDiferencia = Math.abs(diferencia) > 50

  return (
    <div className={cn(
      'rounded-lg border p-2.5 space-y-1',
      hayDiferencia ? 'border-amber-500/40 bg-amber-500/5' : 'border-emerald-500/20 bg-emerald-500/5'
    )}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-200">
          Saldo real MP
        </p>
        {saldoMpReal.actualizado_at && (
          <p className="text-[9px] text-zinc-500 tabular-nums">
            {saldoMpReal.actualizado_at.slice(11, 16)} hrs
          </p>
        )}
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] text-zinc-500">Disponible</span>
        <span className="text-base font-black tabular-nums text-emerald-300">
          {formatMoney(real, saldoMpReal.moneda)}
        </span>
      </div>
      {saldoMpReal.pendiente !== null && saldoMpReal.pendiente > 0 && (
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-zinc-500">Pendiente</span>
          <span className="text-xs tabular-nums text-amber-300">
            +{formatMoney(Number(saldoMpReal.pendiente), saldoMpReal.moneda)}
          </span>
        </div>
      )}
      {hayDiferencia && (
        <a
          href={`/cashflow/diferencias/${saldoMpReal.integ_id}`}
          className="flex items-center justify-between gap-2 pt-1.5 mt-1 border-t border-amber-500/30 text-[11px] text-amber-200 font-medium"
        >
          <span className="inline-flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            App: {formatMoney(saldoCalculado, saldoMpReal.moneda)} · diferencia {formatMoney(Math.abs(diferencia), saldoMpReal.moneda)}
          </span>
          <span className="text-amber-300">Ver →</span>
        </a>
      )}
      {!hayDiferencia && (
        <p className="text-[10px] text-emerald-300/80 pt-0.5">
          ✓ Cuadra con el saldo calculado (diferencia ≤ $50)
        </p>
      )}
    </div>
  )
}
