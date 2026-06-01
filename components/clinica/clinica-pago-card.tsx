'use client'

import { useState, useTransition } from 'react'
import { Loader2, Stethoscope, Star, Wallet, Check, Scissors, X, Clock, ImageIcon } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import { toast } from '@/components/ui/toast'
import {
  hacerCorteComisiones, hacerCortePropinas, hacerCorteReviews, hacerCorteQuincena,
  marcarCortePagado, cancelarCorte,
} from '@/app/(app)/clinica/pagos-actions'
import { aprobarRealizado, rechazarRealizado } from '@/app/(app)/clinica/actions'

export type CorteRow = {
  id: string
  tipo_visual: 'comisiones' | 'reviews' | 'sueldo_quincenal'
  periodo_inicio: string
  periodo_fin: string
  monto_total: number
  created_at: string
}

export type PendienteAprobar = {
  id: string
  tipo: 'review' | 'servicio'
  servicio_nombre: string | null
  fecha: string
  pago_comision: number
  propina: number
  foto_url: string | null
  notas: string | null
}

export type ClinicaPagoData = {
  nombre: string
  enCurso: {
    serviciosCount: number
    comisiones: number
    propinas: number
    reviewsCount: number
    reviewsMonto: number
  }
  quincena: {
    label: string
    monto: number
    estado: 'sin_corte' | 'pendiente' | 'pagado'
  }
  pendientes: CorteRow[]
  historial: CorteRow[]
  pendientesAprobar?: PendienteAprobar[]
}

const TIPO_META: Record<CorteRow['tipo_visual'], { emoji: string; label: string; chip: string }> = {
  comisiones:       { emoji: '🩺', label: 'Comisiones', chip: 'text-cyan-300' },
  reviews:          { emoji: '⭐', label: 'Reviews',    chip: 'text-amber-300' },
  sueldo_quincenal: { emoji: '💼', label: 'Quincena',   chip: 'text-indigo-300' },
}

export function ClinicaPagoCard({
  data, cuentas,
}: {
  data: ClinicaPagoData
  cuentas: Array<{ id: string; nombre: string }>
}) {
  const [pending, start] = useTransition()

  const accionCorte = (fn: () => Promise<{ ok?: boolean; total?: number; error?: string }>, label: string) => {
    start(async () => {
      const r = await fn()
      if (r.ok) toast.success(`Corte de ${label} creado`, `${formatMoney(r.total ?? 0, 'MXN')} pendiente de pago`)
      else toast.error('Error', r.error)
    })
  }

  return (
    <div className="card-glow p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
          <Stethoscope className="h-5 w-5" />
        </span>
        <div className="flex-1 leading-tight">
          <p className="text-sm font-black text-white">{data.nombre}</p>
          <p className="text-[11px] text-zinc-500">Enfermera · clínica · cortes en 2 pasos</p>
        </div>
      </div>

      {/* ═══════ PENDIENTES DE APROBAR ═══════ */}
      {(data.pendientesAprobar?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider font-bold text-rose-300">
            🔔 Pendientes de aprobar ({data.pendientesAprobar!.length}) — Patricia las registró
          </p>
          <div className="space-y-2">
            {data.pendientesAprobar!.map((p) => (
              <PendienteAprobarRow key={p.id} item={p} />
            ))}
          </div>
        </section>
      )}

      {/* ═══════ EN CURSO (pendiente de cortar) ═══════ */}
      <section className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">En curso</p>

        <BloqueEnCurso
          emoji="🩺" label="Comisiones de servicios" color="cyan"
          monto={data.enCurso.comisiones}
          detalle={`${data.enCurso.serviciosCount} servicios`}
          pending={pending}
          onCortar={() => accionCorte(hacerCorteComisiones, 'comisiones')}
        />

        <BloqueEnCurso
          emoji="💵" label="Propinas" color="emerald"
          monto={data.enCurso.propinas}
          detalle="propinas acumuladas (corte aparte)"
          pending={pending}
          onCortar={() => accionCorte(hacerCortePropinas, 'propinas')}
        />

        <BloqueEnCurso
          emoji="⭐" label="Reviews acumuladas" color="amber"
          monto={data.enCurso.reviewsMonto}
          detalle={
            data.enCurso.reviewsCount === 0 ? 'sin reviews todavía'
            : data.enCurso.reviewsCount < 10
              ? `${data.enCurso.reviewsCount} reviews · 💡 cobra al juntar 10 (faltan ${10 - data.enCurso.reviewsCount})`
              : `${data.enCurso.reviewsCount} reviews · ✓ listo para cortar`
          }
          pending={pending}
          onCortar={() => accionCorte(hacerCorteReviews, 'reviews')}
        />

        <BloqueEnCurso
          emoji="💼" label={`Sueldo quincena ${data.quincena.label}`} color="indigo"
          monto={data.quincena.estado === 'sin_corte' ? data.quincena.monto : 0}
          detalle={data.quincena.estado === 'pagado' ? '✓ ya pagada' : data.quincena.estado === 'pendiente' ? '⏳ corte ya hecho, pendiente de pago' : 'base quincenal'}
          pending={pending}
          onCortar={() => accionCorte(hacerCorteQuincena, 'quincena')}
        />
      </section>

      {/* ═══════ CORTES PENDIENTES (cortados, no pagados) ═══════ */}
      {data.pendientes.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider font-bold text-amber-300">
            ⏳ Cortes pendientes de pago ({data.pendientes.length})
          </p>
          <div className="space-y-2">
            {data.pendientes.map((c) => (
              <CorteRowPendiente key={c.id} corte={c} cuentas={cuentas} />
            ))}
          </div>
        </section>
      )}

      {/* ═══════ HISTÓRICO ═══════ */}
      {data.historial.length > 0 && (
        <section className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">✓ Histórico de pagos</p>
          <ul className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)]/40 divide-y divide-[var(--border-subtle)] overflow-hidden">
            {data.historial.map((h) => {
              const m = TIPO_META[h.tipo_visual]
              return (
                <li key={h.id} className="flex items-center gap-2 px-3 py-2 text-[11px]">
                  <span>{m.emoji}</span>
                  <span className="flex-1 truncate text-zinc-300">
                    {m.label} · {formatearFecha(h.periodo_inicio, 'dd MMM')} – {formatearFecha(h.periodo_fin, 'dd MMM')}
                  </span>
                  <span className="text-zinc-600 tabular-nums">{formatearFecha(h.created_at.slice(0, 10), 'dd MMM')}</span>
                  <span className="font-bold tabular-nums text-zinc-100">{formatMoney(Number(h.monto_total), 'MXN')}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Bloque "En curso" (pendiente de cortar)
// ─────────────────────────────────────────────────────
function BloqueEnCurso({
  emoji, label, color, monto, detalle, pending, onCortar,
}: {
  emoji: string; label: string; color: 'cyan' | 'amber' | 'indigo' | 'emerald'
  monto: number; detalle: string; pending: boolean; onCortar: () => void
}) {
  const palette = {
    cyan:    { text: 'text-cyan-300',    ring: 'border-cyan-500/20' },
    amber:   { text: 'text-amber-300',   ring: 'border-amber-500/20' },
    indigo:  { text: 'text-indigo-300',  ring: 'border-indigo-500/20' },
    emerald: { text: 'text-emerald-300', ring: 'border-emerald-500/20' },
  }[color]
  const vacio = monto <= 0

  return (
    <div className={cn('flex items-center gap-3 rounded-xl border bg-[var(--bg-card)]/40 px-3 py-2.5', palette.ring)}>
      <span className="text-base">{emoji}</span>
      <div className="flex-1 min-w-0 leading-tight">
        <p className={cn('text-[11px] font-bold truncate', palette.text)}>{label}</p>
        <p className="text-[10px] text-zinc-500 truncate">{detalle}</p>
      </div>
      <p className={cn('text-sm font-black tabular-nums', vacio ? 'text-zinc-600' : palette.text)}>{formatMoney(monto, 'MXN')}</p>
      <button
        type="button"
        disabled={vacio || pending}
        onClick={onCortar}
        className={cn(
          'h-8 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-colors',
          vacio || pending
            ? 'border border-zinc-800 text-zinc-600 cursor-not-allowed'
            : 'bg-white/5 border border-white/10 text-white hover:bg-white/10',
        )}
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Scissors className="h-3 w-3" />}
        Cortar
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Fila de corte pendiente con expand para Pagar/Cancelar
// ─────────────────────────────────────────────────────
function CorteRowPendiente({
  corte, cuentas,
}: {
  corte: CorteRow
  cuentas: Array<{ id: string; nombre: string }>
}) {
  const m = TIPO_META[corte.tipo_visual]
  const [expanded, setExpanded] = useState(false)
  const [cuentaId, setCuentaId] = useState('')
  const [notas, setNotas] = useState('')
  const [pending, start] = useTransition()

  const pagar = () => {
    start(async () => {
      const r = await marcarCortePagado({ pagoId: corte.id, cuentaId: cuentaId || null, notas: notas || null })
      if (r.ok) {
        toast.success('✓ Pagado', `${formatMoney(r.total ?? 0, 'MXN')} registrados como gasto`)
        setExpanded(false); setNotas('')
      } else toast.error('Error', r.error)
    })
  }

  const cancelar = () => {
    if (!confirm('¿Cancelar este corte? Los servicios volverán a "en curso".')) return
    start(async () => {
      const r = await cancelarCorte(corte.id)
      if (r.ok) toast.info('Corte cancelado')
      else toast.error('Error', r.error)
    })
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="text-base">{m.emoji}</span>
        <div className="flex-1 min-w-0 leading-tight">
          <p className={cn('text-[11px] font-bold', m.chip)}>
            {m.label} · {formatearFecha(corte.periodo_inicio, 'dd MMM')} – {formatearFecha(corte.periodo_fin, 'dd MMM')}
          </p>
          <p className="text-[10px] text-zinc-500 inline-flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" /> cortado {formatearFecha(corte.created_at.slice(0, 10), 'dd MMM')}
          </p>
        </div>
        <p className="text-sm font-black tabular-nums text-amber-200">{formatMoney(Number(corte.monto_total), 'MXN')}</p>
      </div>

      {!expanded ? (
        <div className="flex gap-1.5 px-3 pb-2.5">
          <button
            type="button" disabled={pending}
            onClick={() => setExpanded(true)}
            className="flex-1 h-8 rounded-lg bg-emerald-500 text-zinc-950 text-[11px] font-bold inline-flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Wallet className="h-3 w-3" /> Marcar pagado
          </button>
          <button
            type="button" disabled={pending}
            onClick={cancelar}
            className="h-8 px-2.5 rounded-lg border border-zinc-700 text-zinc-400 text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50"
          >
            <X className="h-3 w-3" /> Cancelar
          </button>
        </div>
      ) : (
        <div className="space-y-2 px-3 pb-3">
          <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="input-base w-full h-8 text-[11px]">
            <option value="">— Cuenta de salida (opcional) —</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas" className="input-base w-full h-8 text-[11px]" />
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setExpanded(false)} className="h-8 px-3 rounded-lg border border-zinc-700 text-zinc-400 text-[11px]">Atrás</button>
            <button
              type="button" disabled={pending}
              onClick={pagar}
              className="flex-1 h-8 rounded-lg bg-emerald-500 text-zinc-950 text-[11px] font-bold inline-flex items-center justify-center gap-1 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              Confirmar pago de {formatMoney(Number(corte.monto_total), 'MXN')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Fila de pendiente de aprobar (registro hecho por la enfermera)
// ─────────────────────────────────────────────────────
function PendienteAprobarRow({ item }: { item: PendienteAprobar }) {
  const [pending, start] = useTransition()
  const [showRechazo, setShowRechazo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const total = Number(item.pago_comision) + Number(item.propina)

  const aprobar = () => {
    start(async () => {
      const r = await aprobarRealizado(item.id)
      if (r.ok) toast.success('✓ Aprobado', 'Ya cuenta en el tabulador')
      else toast.error('Error', r.error)
    })
  }

  const rechazar = () => {
    if (!motivo.trim()) { toast.error('Falta motivo'); return }
    start(async () => {
      const r = await rechazarRealizado(item.id, motivo)
      if (r.ok) { toast.info('Rechazado'); setShowRechazo(false); setMotivo('') }
      else toast.error('Error', r.error)
    })
  }

  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/5">
      <div className="flex gap-3 p-3">
        {item.foto_url ? (
          <a href={item.foto_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.foto_url} alt="" className="h-16 w-16 rounded-lg object-cover border border-rose-500/40" />
          </a>
        ) : (
          <div className="h-16 w-16 rounded-lg bg-zinc-900 border border-zinc-700 inline-flex items-center justify-center shrink-0">
            <ImageIcon className="h-5 w-5 text-zinc-600" />
          </div>
        )}
        <div className="flex-1 min-w-0 leading-tight">
          <p className="text-sm font-bold text-white truncate">{item.tipo === 'review' ? '⭐ ' : '🩺 '}{item.servicio_nombre || 'Sin nombre'}</p>
          <p className="text-[10px] text-zinc-500">{formatearFecha(item.fecha, 'EEE dd MMM')}</p>
          <p className="text-sm font-bold tabular-nums text-rose-200 mt-0.5">{formatMoney(total, 'MXN')}</p>
          {item.notas && <p className="text-[10px] text-zinc-500 truncate italic">"{item.notas}"</p>}
        </div>
      </div>

      {!showRechazo ? (
        <div className="flex gap-1.5 px-3 pb-3">
          <button
            type="button" disabled={pending}
            onClick={aprobar}
            className="flex-1 h-8 rounded-lg bg-emerald-500 text-zinc-950 text-[11px] font-bold inline-flex items-center justify-center gap-1 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Aprobar
          </button>
          <button
            type="button" disabled={pending}
            onClick={() => setShowRechazo(true)}
            className="h-8 px-2.5 rounded-lg border border-zinc-700 text-zinc-400 text-[11px] font-bold inline-flex items-center gap-1 disabled:opacity-50"
          >
            <X className="h-3 w-3" /> Rechazar
          </button>
        </div>
      ) : (
        <div className="space-y-2 px-3 pb-3">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del rechazo" className="input-base w-full h-8 text-[11px]" />
          <div className="flex gap-1.5">
            <button type="button" onClick={() => { setShowRechazo(false); setMotivo('') }} className="h-8 px-3 rounded-lg border border-zinc-700 text-zinc-400 text-[11px]">Atrás</button>
            <button type="button" disabled={pending} onClick={rechazar} className="flex-1 h-8 rounded-lg bg-rose-500 text-white text-[11px] font-bold disabled:opacity-50">
              {pending ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : 'Confirmar rechazo'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
