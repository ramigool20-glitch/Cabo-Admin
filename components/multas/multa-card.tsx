'use client'

import { useState, useTransition } from 'react'
import { Loader2, Check, X, MessageSquare, TrendingDown, Gavel } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import {
  aceptarMulta,
  justificarMulta,
  solicitarReduccionMulta,
  aprobarMulta,
  reducirMulta,
  perdonarMulta,
  disputarMulta,
} from '@/app/(app)/multas/actions'
import { toast } from '@/components/ui/toast'

export type MultaItem = {
  id: string
  tarea_titulo: string | null
  monto_propuesto: number
  monto_final: number | null
  moneda: 'MXN' | 'USD'
  motivo: string
  estado: string
  responsable_id: string
  responsable_nombre: string
  responder_antes_de: string | null
  created_at: string
}

const ESTADOS_LABEL: Record<string, { label: string; color: string }> = {
  propuesta:               { label: 'Propuesta',        color: 'chip-yellow' },
  justificada:             { label: 'Justificada',      color: 'chip-cyan' },
  reduccion_solicitada:    { label: 'Reducción pedida', color: 'chip-cyan' },
  aprobada:                { label: 'Aprobada',         color: 'chip-green' },
  reducida:                { label: 'Reducida',         color: 'chip-green' },
  perdonada:               { label: 'Perdonada',        color: 'chip-green' },
  pendiente_conversacion:  { label: 'En disputa',       color: 'chip-red' },
  aplicada:                { label: '✓ Aplicada',       color: 'chip-green' },
  cancelada:               { label: 'Cancelada',        color: '' },
  aceptada:                { label: 'Aceptada',         color: 'chip-green' },
}

export function MultaCard({
  multa,
  currentUserId,
}: {
  multa: MultaItem
  currentUserId: string
}) {
  const [pending, startTransition] = useTransition()
  const [mostrarAcciones, setMostrarAcciones] = useState(false)
  const [accion, setAccion] = useState<'justificar' | 'reducir' | 'disputar' | 'reducir-otro' | null>(null)
  const [mensaje, setMensaje] = useState('')
  const [montoNuevo, setMontoNuevo] = useState('')

  const esResponsable = multa.responsable_id === currentUserId
  const esOtro = !esResponsable
  const estado = ESTADOS_LABEL[multa.estado] || { label: multa.estado, color: '' }

  const resuelta = ['aplicada', 'perdonada', 'cancelada'].includes(multa.estado)

  const ejecutar = (fn: () => Promise<void>, successMsg?: string) => {
    startTransition(async () => {
      try {
        await fn()
        if (successMsg) toast.success(successMsg)
      } catch (e) {
        toast.error('No se pudo procesar', e instanceof Error ? e.message : 'Inténtalo de nuevo')
      }
      setAccion(null)
      setMensaje('')
      setMontoNuevo('')
      setMostrarAcciones(false)
    })
  }

  return (
    <div className="card-glow p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{multa.tarea_titulo || multa.motivo}</p>
          <p className="text-xs text-zinc-500 truncate">
            Responsable: <span className="text-zinc-300 font-medium">{multa.responsable_nombre}</span>
          </p>
        </div>
        <div className="text-right">
          <p className={cn(
            'text-xl font-black tabular-nums',
            resuelta ? 'text-zinc-400' : 'text-rose-400'
          )}>
            {formatMoney(multa.monto_final ?? multa.monto_propuesto, multa.moneda)}
          </p>
          <span className={cn('chip', estado.color, 'text-[9px] h-5 px-2 mt-1')}>
            {estado.label}
          </span>
        </div>
      </div>

      {multa.motivo && (
        <p className="text-xs text-zinc-400 italic">&ldquo;{multa.motivo}&rdquo;</p>
      )}

      {resuelta && multa.monto_final !== null && multa.monto_final < multa.monto_propuesto && multa.monto_final > 0 && (
        <p className="text-[10px] text-zinc-500">
          Reducida de {formatMoney(multa.monto_propuesto, multa.moneda)} → {formatMoney(multa.monto_final, multa.moneda)}
        </p>
      )}

      {/* Acciones */}
      {!resuelta && !accion && !mostrarAcciones && (
        <button
          type="button"
          onClick={() => setMostrarAcciones(true)}
          className="btn-ghost w-full h-10 text-xs"
        >
          {esResponsable ? 'Responder' : 'Decidir'}
        </button>
      )}

      {/* Acciones del responsable */}
      {esResponsable && mostrarAcciones && !accion && multa.estado === 'propuesta' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => ejecutar(() => aceptarMulta(multa.id), 'Multa aceptada y aplicada')}
            disabled={pending}
            className="h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : '✓ Aceptar'}
          </button>
          <button
            onClick={() => setAccion('justificar')}
            disabled={pending}
            className="h-10 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-bold"
          >
            <MessageSquare className="h-3 w-3 inline mr-1" /> Justificar
          </button>
          <button
            onClick={() => setAccion('reducir')}
            disabled={pending}
            className="h-10 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold col-span-2"
          >
            <TrendingDown className="h-3 w-3 inline mr-1" /> Pedir reducción
          </button>
        </div>
      )}

      {/* Acciones del otro socio (cuando responsable justificó o pidió reducción) */}
      {esOtro && mostrarAcciones && !accion &&
        (multa.estado === 'justificada' || multa.estado === 'reduccion_solicitada' || multa.estado === 'propuesta') && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => ejecutar(() => aprobarMulta(multa.id), 'Multa aprobada')}
            disabled={pending}
            className="h-10 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold"
          >
            ✓ Aprobar
          </button>
          <button
            onClick={() => setAccion('reducir-otro')}
            disabled={pending}
            className="h-10 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold"
          >
            Reducir
          </button>
          <button
            onClick={() => ejecutar(() => perdonarMulta(multa.id), 'Multa perdonada')}
            disabled={pending}
            className="h-10 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-bold"
          >
            <Gavel className="h-3 w-3 inline mr-1" /> Perdonar
          </button>
          <button
            onClick={() => setAccion('disputar')}
            disabled={pending}
            className="h-10 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold"
          >
            <X className="h-3 w-3 inline mr-1" /> Disputar
          </button>
        </div>
      )}

      {/* Form de justificar */}
      {accion === 'justificar' && (
        <div className="space-y-2 pt-2">
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Explica por qué no se completó…"
            rows={3}
            className="input-base w-full !h-auto py-2 text-sm resize-none"
          />
          <div className="flex gap-2">
            <button onClick={() => setAccion(null)} className="btn-ghost flex-1 h-9 text-xs">Cancelar</button>
            <button
              onClick={() => ejecutar(() => justificarMulta(multa.id, mensaje), 'Justificación enviada')}
              disabled={pending || !mensaje.trim()}
              className="btn-primary flex-1 h-9 text-xs"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Enviar justificación'}
            </button>
          </div>
        </div>
      )}

      {/* Form de pedir reducción */}
      {(accion === 'reducir' || accion === 'reducir-otro') && (
        <div className="space-y-2 pt-2">
          <input
            type="text"
            inputMode="decimal"
            value={montoNuevo}
            onChange={(e) => setMontoNuevo(e.target.value)}
            placeholder="Nuevo monto"
            className="input-base w-full"
          />
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Motivo (opcional)"
            rows={2}
            className="input-base w-full !h-auto py-2 text-sm resize-none"
          />
          <div className="flex gap-2">
            <button onClick={() => setAccion(null)} className="btn-ghost flex-1 h-9 text-xs">Cancelar</button>
            <button
              onClick={() => {
                const m = Number(montoNuevo)
                if (!m || m <= 0) return
                if (accion === 'reducir') ejecutar(() => solicitarReduccionMulta(multa.id, m, mensaje), 'Reducción solicitada')
                else ejecutar(() => reducirMulta(multa.id, m, mensaje), 'Multa reducida y aplicada')
              }}
              disabled={pending || !montoNuevo}
              className="btn-primary flex-1 h-9 text-xs"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {/* Form de disputar */}
      {accion === 'disputar' && (
        <div className="space-y-2 pt-2">
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Motivo de la disputa…"
            rows={3}
            className="input-base w-full !h-auto py-2 text-sm resize-none"
          />
          <div className="flex gap-2">
            <button onClick={() => setAccion(null)} className="btn-ghost flex-1 h-9 text-xs">Cancelar</button>
            <button
              onClick={() => ejecutar(() => disputarMulta(multa.id, mensaje), 'Marcada en disputa')}
              disabled={pending || !mensaje.trim()}
              className="btn-primary flex-1 h-9 text-xs"
            >
              {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Marcar en disputa'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
