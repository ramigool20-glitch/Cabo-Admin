'use client'

/**
 * Vista de detalle de una cotización. Carga la imagen generada por el
 * endpoint /api/cotizaciones/[id]/imagen y permite:
 *   • Descargar PNG
 *   • Compartir (Web Share API → AirPrint, WhatsApp, Email)
 *   • Cambiar estado (borrador → enviada → aceptada/rechazada/convertida)
 *   • Eliminar
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Share2, Loader2, Trash2, CheckCircle2, Send, Printer, XCircle } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { actualizarEstadoCotizacion, eliminarCotizacion } from '@/app/(app)/cotizaciones/actions'
import type { Cotizacion, NegocioBranding } from '@/lib/cotizaciones/tipos'

const TIPO_EMOJI: Record<string, string> = {
  farmacia: '💊', consultorio: '🩺', pagina_digital: '🌐', general: '🏢',
}

export function CotizacionDetalleClient({
  cotizacion,
  negocio,
}: {
  cotizacion: Cotizacion
  negocio: NegocioBranding | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)

  const imgUrl = `/api/cotizaciones/${cotizacion.id}/imagen`

  const cambiarEstado = async (estado: Cotizacion['estado']) => {
    setBusy(true)
    const r = await actualizarEstadoCotizacion({ id: cotizacion.id, estado })
    setBusy(false)
    if (r.error) return toast.error('No se cambió', r.error)
    toast.success('Estado actualizado', estado)
    router.refresh()
  }

  const descargar = async () => {
    try {
      const res = await fetch(imgUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${cotizacion.folio}.png`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Descargado', `${cotizacion.folio}.png`)
    } catch {
      toast.error('No se pudo descargar', '')
    }
  }

  const compartir = async () => {
    try {
      const res = await fetch(imgUrl)
      const blob = await res.blob()
      const file = new File([blob], `${cotizacion.folio}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Cotización ${cotizacion.folio}`,
          text: `Cotización ${cotizacion.folio} de ${negocio?.nombre ?? ''} para ${cotizacion.cliente_nombre}`,
        })
      } else {
        // Fallback: copia link al portapapeles
        await navigator.clipboard.writeText(window.location.href)
        toast.success('Link copiado', 'Tu dispositivo no soporta compartir archivos')
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast.error('Error', (e as Error).message)
    }
  }

  const imprimir = () => {
    window.print()
  }

  const eliminar = async () => {
    if (!confirm('¿Eliminar esta cotización?')) return
    setBusy(true)
    await eliminarCotizacion(cotizacion.id)
  }

  const estadoMeta = {
    borrador:   { label: 'Borrador',  color: 'bg-zinc-700/40 text-zinc-300' },
    enviada:    { label: 'Enviada',   color: 'bg-cyan-500/20 text-cyan-200' },
    aceptada:   { label: 'Aceptada',  color: 'bg-emerald-500/20 text-emerald-200' },
    rechazada:  { label: 'Rechazada', color: 'bg-rose-500/20 text-rose-200' },
    expirada:   { label: 'Expirada',  color: 'bg-amber-500/20 text-amber-200' },
    convertida: { label: 'Vendida',   color: 'bg-emerald-500/30 text-emerald-100' },
  }[cotizacion.estado] ?? { label: cotizacion.estado, color: 'bg-zinc-700/40' }

  return (
    <div className="space-y-4">
      {/* Header con folio + estado */}
      <header className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('inline-flex items-center px-2.5 h-6 rounded-full text-[10px] font-bold uppercase tracking-wider', estadoMeta.color)}>
              {estadoMeta.label}
            </span>
            <span className="text-[10px] font-mono text-zinc-500">{cotizacion.folio}</span>
          </div>
          <h1 className="text-xl font-black text-zinc-100 leading-tight">{cotizacion.cliente_nombre}</h1>
          <p className="text-xs text-zinc-500">
            {TIPO_EMOJI[negocio?.tipo ?? 'general']} {negocio?.nombre ?? '—'} · Total{' '}
            <span className="text-emerald-300 font-bold">{formatMoney(cotizacion.total_mxn, 'MXN')}</span>
          </p>
        </div>
      </header>

      {/* Imagen generada */}
      <div className="relative rounded-2xl overflow-hidden border border-cyan-500/20 bg-zinc-950 print:border-0">
        {!imgLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
              <p className="text-xs text-zinc-500">Generando imagen profesional…</p>
            </div>
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgUrl}
          alt={`Cotización ${cotizacion.folio}`}
          onLoad={() => setImgLoaded(true)}
          className={cn(
            'w-full block transition-opacity duration-300',
            imgLoaded ? 'opacity-100' : 'opacity-0'
          )}
        />
      </div>

      {/* Acciones principales */}
      <div className="grid grid-cols-3 gap-2 print:hidden">
        <button
          type="button"
          onClick={descargar}
          className="h-12 rounded-xl bg-zinc-800 text-zinc-100 text-xs font-bold inline-flex items-center justify-center gap-1.5 active:scale-95"
        >
          <Download className="h-4 w-4" /> Descargar
        </button>
        <button
          type="button"
          onClick={compartir}
          className="h-12 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-500/30 active:scale-95"
        >
          <Share2 className="h-4 w-4" /> Compartir
        </button>
        <button
          type="button"
          onClick={imprimir}
          className="h-12 rounded-xl bg-zinc-800 text-zinc-100 text-xs font-bold inline-flex items-center justify-center gap-1.5 active:scale-95"
        >
          <Printer className="h-4 w-4" /> Imprimir
        </button>
      </div>

      {/* Estados rápidos */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 space-y-2 print:hidden">
        <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-500">Cambiar estado</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {cotizacion.estado === 'borrador' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => cambiarEstado('enviada')}
              className="h-9 px-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 text-[11px] font-bold inline-flex items-center justify-center gap-1 active:scale-95"
            >
              <Send className="h-3 w-3" /> Enviada
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => cambiarEstado('aceptada')}
            className="h-9 px-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-[11px] font-bold inline-flex items-center justify-center gap-1 active:scale-95"
          >
            <CheckCircle2 className="h-3 w-3" /> Aceptada
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => cambiarEstado('rechazada')}
            className="h-9 px-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-200 text-[11px] font-bold inline-flex items-center justify-center gap-1 active:scale-95"
          >
            <XCircle className="h-3 w-3" /> Rechazada
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => cambiarEstado('convertida')}
            className="h-9 px-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-100 text-[11px] font-bold inline-flex items-center justify-center gap-1 active:scale-95"
          >
            <CheckCircle2 className="h-3 w-3" /> Vendida
          </button>
        </div>
      </div>

      {/* Eliminar */}
      <button
        type="button"
        disabled={busy}
        onClick={eliminar}
        className="w-full h-11 rounded-xl border border-rose-500/30 text-rose-300 inline-flex items-center justify-center gap-2 text-sm font-medium hover:bg-rose-500/10 print:hidden"
      >
        <Trash2 className="h-4 w-4" />
        Eliminar cotización
      </button>
    </div>
  )
}
