'use client'

import { useState } from 'react'
import { Loader2, TrendingUp, TrendingDown, AlertCircle, CheckCircle2, ShoppingBag } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { crearCorteCaja } from '@/app/(app)/pos/corte/actions'

type Esperado = {
  efectivo: number
  mp: number
  tarjeta: number
  transfer: number
  total: number
}

export function CorteCajaClient({
  negocioId,
  fecha,
  esperado,
  ventasCount,
  unidades,
  ganancia,
}: {
  negocioId: string
  fecha: string
  esperado: Esperado
  ventasCount: number
  unidades: number
  ganancia: number
}) {
  const [contadoEfectivo, setContadoEfectivo] = useState(esperado.efectivo.toFixed(2))
  const [contadoMp, setContadoMp] = useState(esperado.mp.toFixed(2))
  const [contadoTarjeta, setContadoTarjeta] = useState(esperado.tarjeta.toFixed(2))
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  const contadoEfectivoNum = Number(contadoEfectivo) || 0
  const contadoMpNum = Number(contadoMp) || 0
  const contadoTarjetaNum = Number(contadoTarjeta) || 0
  const totalContado = contadoEfectivoNum + contadoMpNum + contadoTarjetaNum

  const difEfectivo = esperado.efectivo - contadoEfectivoNum
  const difTotal = esperado.total - totalContado

  const guardar = async () => {
    setGuardando(true)
    try {
      const r = await crearCorteCaja({
        negocio_id: negocioId,
        fecha,
        esperado_efectivo_mxn: esperado.efectivo,
        esperado_mp_mxn: esperado.mp,
        esperado_tarjeta_mxn: esperado.tarjeta,
        esperado_transfer_mxn: esperado.transfer,
        esperado_total_mxn: esperado.total,
        ventas_count: ventasCount,
        unidades_vendidas: unidades,
        ganancia_estimada_mxn: ganancia,
        contado_efectivo_mxn: contadoEfectivoNum,
        contado_mp_mxn: contadoMpNum,
        contado_tarjeta_mxn: contadoTarjetaNum,
        notas: notas.trim() || null,
      })
      if (r?.error) {
        setGuardando(false)
        return toast.error('No se cerró', r.error)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (!msg.includes('NEXT_REDIRECT')) {
        setGuardando(false)
        toast.error('Error', msg || 'Error desconocido')
      }
    }
  }

  // Empty state si no hay ventas hoy
  if (ventasCount === 0) {
    return (
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900/40 p-6 text-center space-y-3">
        <ShoppingBag className="h-10 w-10 text-zinc-500 mx-auto opacity-50" />
        <p className="text-base font-bold text-zinc-200">Sin ventas hoy</p>
        <p className="text-xs text-zinc-500">El corte se genera cuando hay al menos una venta registrada.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Resumen del turno */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Resumen del turno</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-2xl font-black text-emerald-300 tabular-nums leading-none">{ventasCount}</p>
            <p className="text-[10px] text-zinc-500 uppercase mt-0.5">Ventas</p>
          </div>
          <div>
            <p className="text-2xl font-black text-cyan-300 tabular-nums leading-none">{unidades}</p>
            <p className="text-[10px] text-zinc-500 uppercase mt-0.5">Unidades</p>
          </div>
          <div>
            <p className="text-lg font-black text-emerald-300 tabular-nums leading-none">+{formatMoney(ganancia, 'MXN')}</p>
            <p className="text-[10px] text-zinc-500 uppercase mt-0.5">Ganancia</p>
          </div>
        </div>
      </div>

      {/* Esperado vs Contado por método */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-zinc-800">
        <MetodoRow
          label="💵 Efectivo"
          esperado={esperado.efectivo}
          contado={contadoEfectivo}
          onChange={setContadoEfectivo}
          diferencia={difEfectivo}
          editable
        />
        <MetodoRow
          label="📱 Mercado Pago"
          esperado={esperado.mp}
          contado={contadoMp}
          onChange={setContadoMp}
          diferencia={esperado.mp - contadoMpNum}
        />
        <MetodoRow
          label="💳 Tarjeta"
          esperado={esperado.tarjeta}
          contado={contadoTarjeta}
          onChange={setContadoTarjeta}
          diferencia={esperado.tarjeta - contadoTarjetaNum}
        />
        {esperado.transfer > 0 && (
          <MetodoRow
            label="🏦 Transferencia"
            esperado={esperado.transfer}
            contado={esperado.transfer.toFixed(2)}
            onChange={() => {}}
            diferencia={0}
          />
        )}
      </div>

      {/* Total + diferencia */}
      <div className={cn(
        'rounded-2xl border p-3 space-y-2',
        Math.abs(difTotal) < 0.5 ? 'border-emerald-500/30 bg-emerald-500/5'
          : difTotal > 0 ? 'border-rose-500/30 bg-rose-500/5'
          : 'border-amber-500/30 bg-amber-500/5'
      )}>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider font-bold text-zinc-500">Esperado total</span>
          <span className="text-xl font-black text-zinc-300 tabular-nums">{formatMoney(esperado.total, 'MXN')}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider font-bold text-zinc-500">Contado total</span>
          <span className="text-xl font-black text-zinc-100 tabular-nums">{formatMoney(totalContado, 'MXN')}</span>
        </div>
        <div className="border-t border-zinc-800 pt-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-bold">
            {Math.abs(difTotal) < 0.5 ? (
              <><CheckCircle2 className="h-3 w-3 text-emerald-400" /> <span className="text-emerald-300">Cuadra</span></>
            ) : difTotal > 0 ? (
              <><TrendingDown className="h-3 w-3 text-rose-400" /> <span className="text-rose-300">Falta</span></>
            ) : (
              <><TrendingUp className="h-3 w-3 text-amber-400" /> <span className="text-amber-300">Sobra</span></>
            )}
          </span>
          <span className={cn(
            'text-2xl font-black tabular-nums',
            Math.abs(difTotal) < 0.5 ? 'text-emerald-300'
              : difTotal > 0 ? 'text-rose-300' : 'text-amber-300'
          )}>
            {difTotal === 0 ? '$0.00' : (difTotal > 0 ? '-' : '+') + formatMoney(Math.abs(difTotal), 'MXN')}
          </span>
        </div>
      </div>

      {/* Notas */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Notas (opcional)</label>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          rows={2}
          placeholder="Ej: cliente pagó con billete falso, etc."
          className="input-base w-full px-3 py-2 text-sm"
        />
      </div>

      {/* Aviso de diferencia */}
      {Math.abs(difTotal) >= 0.5 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2">
          <AlertCircle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/80">
            Hay una diferencia de <strong>{formatMoney(Math.abs(difTotal), 'MXN')}</strong>.
            Verifica el conteo. Si es correcto, agrega una nota explicando.
          </p>
        </div>
      )}

      {/* Botón cerrar */}
      <button
        type="button"
        onClick={guardar}
        disabled={guardando}
        className="w-full h-14 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-black text-base inline-flex items-center justify-center gap-2 disabled:opacity-30 shadow-lg shadow-emerald-500/30 active:scale-[0.98]"
      >
        {guardando ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Cerrar caja'}
      </button>
    </div>
  )
}

function MetodoRow({
  label, esperado, contado, onChange, diferencia, editable = true,
}: {
  label: string
  esperado: number
  contado: string
  onChange: (v: string) => void
  diferencia: number
  editable?: boolean
}) {
  const cuadra = Math.abs(diferencia) < 0.5
  return (
    <div className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-zinc-200">{label}</span>
        <span className="text-xs text-zinc-500">Esperado: <span className="text-zinc-300 font-bold tabular-nums">{formatMoney(esperado, 'MXN')}</span></span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Contado</label>
          <input
            type="number"
            step="0.01"
            value={contado}
            onChange={e => onChange(e.target.value)}
            disabled={!editable}
            className={cn(
              'w-full mt-1 h-10 px-3 rounded-lg border border-zinc-700 bg-zinc-900 text-sm font-bold tabular-nums focus:outline-none focus:ring-2',
              cuadra ? 'focus:ring-emerald-500' : 'focus:ring-amber-500',
              !editable && 'opacity-60'
            )}
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Diferencia</label>
          <div className={cn(
            'mt-1 h-10 px-3 rounded-lg flex items-center justify-end font-bold tabular-nums',
            cuadra ? 'bg-emerald-500/10 text-emerald-300'
              : diferencia > 0 ? 'bg-rose-500/10 text-rose-300'
              : 'bg-amber-500/10 text-amber-300'
          )}>
            {cuadra ? '✓ cuadra' : (diferencia > 0 ? '-' : '+') + formatMoney(Math.abs(diferencia), 'MXN')}
          </div>
        </div>
      </div>
    </div>
  )
}
