'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { Loader2, Plus, X, RefreshCw, Trash2, CreditCard, MessageCircle, Save, ExternalLink } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import {
  agregarIntegracionMP, sincronizarMPAhora, eliminarIntegracionMP,
  agregarNumeroWhatsApp, type IntegState,
} from '@/app/(app)/config/integraciones-actions'

type Cuenta = { id: string; nombre: string }
type Negocio = { id: string; nombre: string }
type Socio = { id: string; nombre: string }
type IntegMP = { id: string; nombre: string; activa: boolean; cobros_count: number; ultimo_sync: string | null }
type NumWA = { id: string; numero: string; nombre: string | null; activo: boolean }

export function IntegracionesPanel({
  cuentas, negocios, socios, integraciones, numeros, prodUrl,
}: {
  cuentas: Cuenta[]
  negocios: Negocio[]
  socios: Socio[]
  integraciones: IntegMP[]
  numeros: NumWA[]
  prodUrl: string
}) {
  return (
    <div className="space-y-5">
      {/* MERCADO PAGO */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <CreditCard className="h-4 w-4 text-sky-400" />
          <h3 className="text-sm font-bold text-white">Mercado Pago (Terminal Point)</h3>
        </div>
        <p className="text-[11px] text-zinc-500 px-1">
          Conecta cada cuenta MP. Los cobros de la terminal entran como ingreso automático.
        </p>

        {integraciones.map((i) => (
          <IntegMPRow key={i.id} integ={i} prodUrl={prodUrl} />
        ))}

        <AgregarMPForm cuentas={cuentas} negocios={negocios} />
      </div>

      {/* WHATSAPP */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <MessageCircle className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">WhatsApp (captura por IA)</h3>
        </div>
        <p className="text-[11px] text-zinc-500 px-1">
          Números autorizados a mandar gastos por audio/foto/texto al bot.
        </p>
        {numeros.map((n) => (
          <div key={n.id} className="card p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">{n.nombre || 'Sin nombre'}</p>
              <p className="text-[11px] text-zinc-500 tabular-nums">+{n.numero}</p>
            </div>
            <span className={`chip text-[9px] ${n.activo ? 'chip-green' : ''}`}>{n.activo ? 'Activo' : 'Inactivo'}</span>
          </div>
        ))}
        <AgregarWAForm socios={socios} />
      </div>
    </div>
  )
}

function IntegMPRow({ integ, prodUrl }: { integ: IntegMP; prodUrl: string }) {
  const [pending, start] = useTransition()
  const webhookUrl = `${prodUrl}/api/webhooks/mercadopago?integ=${integ.id}`

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-white">{integ.nombre}</p>
          <p className="text-[10px] text-zinc-500">
            {integ.cobros_count} cobros importados
            {integ.ultimo_sync && ` · últ. ${integ.ultimo_sync.slice(0, 16).replace('T', ' ')}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => start(async () => {
              const r = await sincronizarMPAhora(integ.id)
              if (r.ok) toast.success('Sincronizado', 'Cobros recientes importados')
              else toast.error('Error', r.error)
            })}
            disabled={pending}
            className="h-8 w-8 rounded-md border border-cyan-500/40 text-cyan-300 inline-flex items-center justify-center"
            title="Sincronizar ahora"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirm(`¿Eliminar integración ${integ.nombre}?`)) return
              start(async () => { await eliminarIntegracionMP(integ.id); toast.info('Eliminada') })
            }}
            disabled={pending}
            className="h-8 w-8 rounded-md text-zinc-500 hover:text-rose-400 inline-flex items-center justify-center"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {/* URL del webhook a configurar en MP */}
      <div className="rounded-md bg-black/30 border border-[var(--border-subtle)] p-2">
        <p className="text-[9px] text-zinc-500 uppercase tracking-wider mb-0.5">Webhook URL (pégala en MP → Notificaciones)</p>
        <p className="text-[10px] text-cyan-300 font-mono break-all">{webhookUrl}</p>
      </div>
    </div>
  )
}

function AgregarMPForm({ cuentas, negocios }: { cuentas: Cuenta[]; negocios: Negocio[] }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<IntegState, FormData>(agregarIntegracionMP, {})

  useEffect(() => {
    if (state.ok) { toast.success('Cuenta MP conectada', 'Configura la webhook URL en MP'); setOpen(false) }
    else if (state.error) toast.error('Error', state.error)
  }, [state])

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost h-10 text-xs w-full border border-sky-500/30 text-sky-300">
        <Plus className="h-4 w-4" /> Conectar cuenta Mercado Pago
      </button>
    )
  }

  return (
    <form action={formAction} className="card-glow border-sky-500/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-sky-300">Nueva cuenta MP</p>
        <button type="button" onClick={() => setOpen(false)} className="text-zinc-500"><X className="h-4 w-4" /></button>
      </div>
      <input name="nombre" placeholder="Nombre (ej: MP Sergio)" required className="input-base w-full h-9 text-xs" />
      <input name="access_token" placeholder="Access Token (APP_USR-...)" required className="input-base w-full h-9 text-xs font-mono" />
      <div className="grid grid-cols-2 gap-2">
        <select name="cuenta_id" defaultValue="" className="input-base w-full h-9 text-xs">
          <option value="">— Cuenta del saldo —</option>
          {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select name="negocio_default_id" defaultValue="" className="input-base w-full h-9 text-xs">
          <option value="">— Negocio —</option>
          {negocios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select>
      </div>
      <a href="https://www.mercadopago.com.mx/developers/panel/app" target="_blank" rel="noreferrer" className="text-[10px] text-sky-400 inline-flex items-center gap-1">
        <ExternalLink className="h-3 w-3" /> ¿Dónde saco el Access Token?
      </a>
      {state.error && <p className="text-[11px] text-rose-400">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full h-9 text-xs">
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        Validar y conectar
      </button>
    </form>
  )
}

function AgregarWAForm({ socios }: { socios: Socio[] }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<IntegState, FormData>(agregarNumeroWhatsApp, {})

  useEffect(() => {
    if (state.ok) { toast.success('Número autorizado'); setOpen(false) }
    else if (state.error) toast.error('Error', state.error)
  }, [state])

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-ghost h-10 text-xs w-full border border-emerald-500/30 text-emerald-300">
        <Plus className="h-4 w-4" /> Autorizar número WhatsApp
      </button>
    )
  }

  return (
    <form action={formAction} className="card-glow border-emerald-500/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-emerald-300">Autorizar número</p>
        <button type="button" onClick={() => setOpen(false)} className="text-zinc-500"><X className="h-4 w-4" /></button>
      </div>
      <input name="numero" placeholder="Número con lada país (521624...)" required className="input-base w-full h-9 text-xs font-mono" />
      <input name="nombre" placeholder="Nombre (Miguel, Sergio)" className="input-base w-full h-9 text-xs" />
      <select name="profile_id" defaultValue="" className="input-base w-full h-9 text-xs">
        <option value="">— Vincular a socio (opcional) —</option>
        {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </select>
      {state.error && <p className="text-[11px] text-rose-400">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full h-9 text-xs">
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        Autorizar
      </button>
    </form>
  )
}
