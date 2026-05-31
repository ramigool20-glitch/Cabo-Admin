'use client'

import { useState, useTransition } from 'react'
import { Loader2, Stethoscope, Star, Wallet, Check, ChevronDown } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import { toast } from '@/components/ui/toast'
import { pagarComisionesEnfermera, pagarSueldoQuincenaEnfermera } from '@/app/(app)/clinica/pagos-actions'

export type ClinicaPagoData = {
  nombre: string
  comisiones: number
  propinas: number
  serviciosCount: number
  reviewsMonto: number
  reviewsCount: number
  sueldoQuincenalMonto: number
  sueldoQuincenaLabel: string
  sueldoQuincenaPagado: boolean
  sueldoQuincenaPagadoAt?: string | null
  historial: Array<{
    id: string
    tipo: 'comisiones' | 'sueldo_quincenal'
    monto_total: number
    periodo_inicio: string
    periodo_fin: string
    created_at: string
  }>
}

export function ClinicaPagoCard({
  data, cuentas,
}: {
  data: ClinicaPagoData
  cuentas: Array<{ id: string; nombre: string }>
}) {
  const [pending, start] = useTransition()
  const [expandCom, setExpandCom] = useState(false)
  const [expandSueldo, setExpandSueldo] = useState(false)
  const [incluyeReviews, setIncluyeReviews] = useState(true)
  const [cuentaIdCom, setCuentaIdCom] = useState<string>('')
  const [cuentaIdSueldo, setCuentaIdSueldo] = useState<string>('')
  const [notasCom, setNotasCom] = useState('')
  const [notasSueldo, setNotasSueldo] = useState('')

  const totalComisiones = data.comisiones + data.propinas + (incluyeReviews ? data.reviewsMonto : 0)
  const hayComisionesPendientes = data.serviciosCount > 0 || data.propinas > 0 || data.reviewsCount > 0

  const pagarCom = () => {
    start(async () => {
      const res = await pagarComisionesEnfermera({
        incluyeReviews,
        cuentaId: cuentaIdCom || null,
        notas: notasCom || null,
      })
      if (res.ok) {
        toast.success('Pagado ✓', `${formatMoney(res.total ?? 0, 'MXN')} registrados como gasto`)
        setExpandCom(false); setNotasCom('')
      } else toast.error('Error', res.error)
    })
  }

  const pagarSueldo = () => {
    start(async () => {
      const res = await pagarSueldoQuincenaEnfermera({
        cuentaId: cuentaIdSueldo || null,
        notas: notasSueldo || null,
      })
      if (res.ok) {
        toast.success('Quincena pagada ✓', `${formatMoney(res.total ?? 0, 'MXN')} registrados`)
        setExpandSueldo(false); setNotasSueldo('')
      } else toast.error('Error', res.error)
    })
  }

  return (
    <div className="card-glow p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
          <Stethoscope className="h-5 w-5" />
        </span>
        <div className="flex-1 leading-tight">
          <p className="text-sm font-black text-white">{data.nombre}</p>
          <p className="text-[11px] text-zinc-500">Enfermera · clínica</p>
        </div>
      </div>

      {/* 🩺 Comisiones semanales */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/40 p-3 space-y-2">
        <button type="button" onClick={() => setExpandCom((v) => !v)} className="w-full flex items-center gap-2 text-left">
          <span className="text-base">🩺</span>
          <div className="flex-1 leading-tight">
            <p className="text-xs font-bold text-cyan-300">Comisiones pendientes</p>
            <p className="text-[10px] text-zinc-500">
              {data.serviciosCount} servicios · {formatMoney(data.comisiones, 'MXN')}
              {data.propinas > 0 && ` + ${formatMoney(data.propinas, 'MXN')} propinas`}
            </p>
          </div>
          <p className="text-sm font-black tabular-nums text-cyan-300">{formatMoney(data.comisiones + data.propinas, 'MXN')}</p>
          <ChevronDown className={cn('h-4 w-4 text-zinc-500 transition-transform', expandCom && 'rotate-180')} />
        </button>

        {/* Reviews acumuladas (toggle) */}
        {data.reviewsCount > 0 && (
          <label className="flex items-center gap-2 rounded-lg bg-amber-500/8 border border-amber-500/20 p-2 cursor-pointer">
            <input
              type="checkbox"
              checked={incluyeReviews}
              onChange={(e) => setIncluyeReviews(e.target.checked)}
              className="h-4 w-4 rounded border-amber-500/40 bg-[var(--bg-input)] text-amber-500"
            />
            <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
            <span className="flex-1 text-[11px] text-amber-200">
              {data.reviewsCount} reviews · {formatMoney(data.reviewsMonto, 'MXN')}
            </span>
            <span className="text-[9px] text-amber-300/60">{incluyeReviews ? 'incluir' : 'rodar a siguiente'}</span>
          </label>
        )}

        {expandCom && hayComisionesPendientes && (
          <div className="space-y-2 pt-1">
            <div className="space-y-1.5">
              <label className="label-caps">Cuenta de salida (opcional)</label>
              <select value={cuentaIdCom} onChange={(e) => setCuentaIdCom(e.target.value)} className="input-base w-full h-9 text-xs">
                <option value="">— Sin cuenta —</option>
                {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <input
              value={notasCom}
              onChange={(e) => setNotasCom(e.target.value)}
              placeholder="Notas (opcional)"
              className="input-base w-full h-9 text-xs"
            />
            <button
              type="button"
              disabled={pending}
              onClick={pagarCom}
              className="w-full h-10 rounded-lg bg-emerald-500 text-zinc-950 text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              Pagar {formatMoney(totalComisiones, 'MXN')}
            </button>
          </div>
        )}

        {!hayComisionesPendientes && (
          <p className="text-[11px] text-zinc-500 text-center py-1">Sin comisiones pendientes ✨</p>
        )}
      </section>

      {/* 💼 Sueldo quincenal */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/40 p-3 space-y-2">
        <button type="button" onClick={() => setExpandSueldo((v) => !v)} className="w-full flex items-center gap-2 text-left">
          <span className="text-base">💼</span>
          <div className="flex-1 leading-tight">
            <p className="text-xs font-bold text-indigo-300">Sueldo quincena</p>
            <p className="text-[10px] text-zinc-500">{data.sueldoQuincenaLabel}</p>
          </div>
          {data.sueldoQuincenaPagado ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              <Check className="h-3 w-3" /> Pagada
            </span>
          ) : (
            <p className="text-sm font-black tabular-nums text-indigo-300">{formatMoney(data.sueldoQuincenalMonto, 'MXN')}</p>
          )}
          <ChevronDown className={cn('h-4 w-4 text-zinc-500 transition-transform', expandSueldo && 'rotate-180')} />
        </button>

        {data.sueldoQuincenaPagado && data.sueldoQuincenaPagadoAt && (
          <p className="text-[10px] text-zinc-500">Pagada el {formatearFecha(data.sueldoQuincenaPagadoAt.slice(0, 10), 'dd MMM yyyy')}</p>
        )}

        {expandSueldo && !data.sueldoQuincenaPagado && data.sueldoQuincenalMonto > 0 && (
          <div className="space-y-2 pt-1">
            <div className="space-y-1.5">
              <label className="label-caps">Cuenta de salida (opcional)</label>
              <select value={cuentaIdSueldo} onChange={(e) => setCuentaIdSueldo(e.target.value)} className="input-base w-full h-9 text-xs">
                <option value="">— Sin cuenta —</option>
                {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <input
              value={notasSueldo}
              onChange={(e) => setNotasSueldo(e.target.value)}
              placeholder="Notas (opcional)"
              className="input-base w-full h-9 text-xs"
            />
            <button
              type="button"
              disabled={pending}
              onClick={pagarSueldo}
              className="w-full h-10 rounded-lg bg-indigo-500 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              Pagar quincena {formatMoney(data.sueldoQuincenalMonto, 'MXN')}
            </button>
          </div>
        )}
      </section>

      {/* Histórico */}
      {data.historial.length > 0 && (
        <section className="space-y-1">
          <p className="label-caps">📜 Últimos pagos</p>
          <ul className="space-y-0.5">
            {data.historial.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="text-zinc-600">{formatearFecha(h.created_at.slice(0, 10), 'dd MMM')}</span>
                <span className="flex-1">{h.tipo === 'comisiones' ? '🩺 Comisiones' : '💼 Quincena'}</span>
                <span className="tabular-nums font-bold text-zinc-200">{formatMoney(Number(h.monto_total), 'MXN')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
