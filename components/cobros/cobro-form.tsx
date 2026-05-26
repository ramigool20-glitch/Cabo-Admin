'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Link as LinkIcon, QrCode, Loader2, Copy, Check, Share2, Wifi } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

type Negocio = { id: string; nombre: string }

type Resultado = {
  id: string
  payment_url: string
  qr_url: string | null
  session_id: string
}

export function CobroForm({ negocios }: { negocios: Negocio[] }) {
  const [tab, setTab] = useState<'link' | 'qr'>('link')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [moneda, setMoneda] = useState<'USD' | 'MXN'>('USD')
  const [montoState, setMontoState] = useState('')

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setResultado(null)
    const fd = new FormData(e.currentTarget)
    const body = {
      negocio_id: fd.get('negocio_id') || null,
      cliente_nombre: fd.get('cliente_nombre') || null,
      cliente_email: fd.get('cliente_email') || null,
      cliente_telefono: fd.get('cliente_telefono') || null,
      descripcion: String(fd.get('descripcion') || ''),
      monto: Number(fd.get('monto') || 0),
      moneda,
    }
    if (!body.descripcion || !body.monto) {
      setError('Falta descripción o monto')
      return
    }

    setPending(true)
    try {
      const res = await fetch('/api/stripe/crear-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || 'Error desconocido')
        toast.error('No se generó el link', data.error || 'Inténtalo de nuevo')
        return
      }
      setResultado({
        id: data.id,
        payment_url: data.payment_url,
        qr_url: data.qr_url,
        session_id: data.session_id,
      })
      toast.success('Link de cobro creado', 'Listo para compartir por WhatsApp')
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : 'Error de red'
      setError(msg)
      toast.error('Error de red', msg)
    } finally {
      setPending(false)
    }
  }

  const copiarLink = async () => {
    if (!resultado) return
    await navigator.clipboard.writeText(resultado.payment_url)
    setCopiado(true)
    toast.info('Link copiado al portapapeles')
    setTimeout(() => setCopiado(false), 2000)
  }

  const compartir = async () => {
    if (!resultado) return
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Link de pago',
          text: 'Tu link de pago seguro:',
          url: resultado.payment_url,
        })
      } catch {
        copiarLink()
      }
    } else {
      copiarLink()
    }
  }

  if (resultado) {
    return (
      <div className="space-y-4">
        <div className="card-glow border-emerald-500/40 p-5 space-y-4">
          <div className="flex items-center gap-2 text-emerald-300">
            <Check className="h-5 w-5" />
            <span className="text-sm font-bold">Link generado</span>
          </div>

          {/* QR si lo eligió */}
          {tab === 'qr' && resultado.qr_url && (
            <div className="flex justify-center">
              <div className="bg-white p-4 rounded-2xl">
                <Image
                  src={resultado.qr_url}
                  alt="QR Code"
                  width={240}
                  height={240}
                  unoptimized
                />
              </div>
            </div>
          )}

          {/* Link */}
          <div className="space-y-2">
            <p className="label-caps">Link de pago</p>
            <div className="rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)] p-3 text-xs text-cyan-300 break-all">
              {resultado.payment_url}
            </div>
          </div>

          {/* Acciones */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={copiarLink} className="btn-ghost h-11 text-sm">
              {copiado ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              {copiado ? 'Copiado' : 'Copiar'}
            </button>
            <button onClick={compartir} className="btn-primary h-11 text-sm">
              <Share2 className="h-4 w-4" />
              Compartir
            </button>
          </div>

          <p className="text-[11px] text-zinc-500 text-center">
            El cobro aparecerá como ingreso automático cuando el cliente pague (vía webhook).
          </p>
        </div>

        <button onClick={() => setResultado(null)} className="btn-ghost w-full h-11 text-sm">
          Generar otro
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => setTab('link')}
          className={cn(
            'h-11 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors',
            tab === 'link'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow'
              : 'text-zinc-400'
          )}
        >
          <LinkIcon className="h-4 w-4" /> Link de Pago
        </button>
        <button
          type="button"
          onClick={() => setTab('qr')}
          className={cn(
            'h-11 rounded-lg text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors',
            tab === 'qr'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow'
              : 'text-zinc-400'
          )}
        >
          <QrCode className="h-4 w-4" /> QR Code
        </button>
      </div>

      {/* Negocio */}
      <div className="space-y-1.5">
        <label htmlFor="negocio_id" className="label-caps">Negocio</label>
        <select id="negocio_id" name="negocio_id" className="input-base w-full text-sm">
          <option value="">— Sin asignar</option>
          {negocios.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select>
      </div>

      {/* Cliente */}
      <div className="space-y-1.5">
        <label htmlFor="cliente_nombre" className="label-caps">Nombre cliente <span className="text-zinc-500">(opcional)</span></label>
        <input id="cliente_nombre" name="cliente_nombre" type="text" placeholder="Ej: John Smith" className="input-base w-full text-sm" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="cliente_email" className="label-caps">Email</label>
          <input id="cliente_email" name="cliente_email" type="email" placeholder="cliente@email.com" className="input-base w-full text-sm" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cliente_telefono" className="label-caps">Teléfono</label>
          <input id="cliente_telefono" name="cliente_telefono" type="tel" placeholder="+52 624..." className="input-base w-full text-sm" />
        </div>
      </div>

      {/* Descripción */}
      <div className="space-y-1.5">
        <label htmlFor="descripcion" className="label-caps">Descripción del servicio <span className="text-rose-400">*</span></label>
        <input
          id="descripcion"
          name="descripcion"
          type="text"
          required
          placeholder="IV Drip Premium, consulta…"
          className="input-base w-full text-sm"
        />
      </div>

      {/* Monto + moneda */}
      <div className="space-y-1.5">
        <label htmlFor="monto" className="label-caps">
          Monto {moneda} <span className="text-rose-400">*</span>
        </label>
        <div className="flex gap-2">
          <input
            id="monto"
            name="monto"
            type="text"
            inputMode="decimal"
            required
            value={montoState}
            onChange={(e) => setMontoState(e.target.value)}
            placeholder="0.00"
            className="input-base flex-1 text-xl font-bold tabular-nums"
          />
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            {(['USD', 'MXN'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMoneda(m)}
                className={cn(
                  'h-10 w-14 rounded-lg text-sm font-bold transition-colors',
                  moneda === m ? 'bg-[var(--bg-card)] text-white shadow' : 'text-zinc-500'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full text-base">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : tab === 'qr' ? <QrCode className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
        {pending ? 'Generando…' : tab === 'qr' ? 'Generar QR' : 'Generar Link de Pago'}
      </button>

      <p className="text-[10px] text-emerald-400/70 text-center inline-flex items-center justify-center gap-1 w-full">
        <Wifi className="h-3 w-3" />
        Stripe activo · El pago aparecerá como ingreso automático
      </p>
    </form>
  )
}
