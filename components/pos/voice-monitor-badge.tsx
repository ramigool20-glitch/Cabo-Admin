'use client'

/**
 * Badge silencioso del monitor de voz.
 * - No hay botón para apagar (Tania ya firmó contrato)
 * - Indica el idioma actual: ES/EN
 * - Indica cuando captó un evento
 */

import { useCallback, useState } from 'react'
import { Mic, AlertCircle } from 'lucide-react'
import { useVoiceMonitor, type VoiceEvent } from '@/lib/voice/use-voice-monitor'
import { guardarVoiceEvent } from '@/app/(app)/pos/voice-actions'
import { toast } from '@/components/ui/toast'

export function VoiceMonitorBadge({ tema, rateUsd = 17 }: { tema: 'light' | 'dark'; rateUsd?: number }) {
  const [ultimoMonto, setUltimoMonto] = useState<number | null>(null)

  const handleEvent = useCallback(async (e: VoiceEvent) => {
    // Convertir USD → MXN si aplica
    let montoMxn: number | null = null
    let montoOriginal: number | null = null
    let moneda: 'MXN' | 'USD' | null = null
    let tcAplicado: number | null = null
    if (e.monto) {
      montoOriginal = e.monto.monto
      moneda = e.monto.moneda
      if (e.monto.moneda === 'USD') {
        montoMxn = Number((e.monto.monto * rateUsd).toFixed(2))
        tcAplicado = rateUsd
      } else {
        montoMxn = e.monto.monto
      }
    }

    if (montoMxn !== null) setUltimoMonto(montoMxn)

    try {
      const r = await guardarVoiceEvent({
        keyword: e.match.keyword,
        categoria: e.match.categoria,
        transcript: e.transcript,
        confidence: e.confidence,
        idioma: e.idioma,
        nivel: e.nivel,
        monto_detectado_mxn: montoMxn,
        monto_original: montoOriginal,
        monto_moneda: moneda,
        tipo_cambio_aplicado: tcAplicado,
        es_venta_potencial: e.es_venta_potencial,
      })
      if (r.ok && r.id) {
        // Disparar análisis IA para criticos y conversaciones
        if (e.nivel === 'critico' || e.nivel === 'conversacion') {
          fetch('/api/ai/analizar-voz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voice_event_id: r.id }),
          }).catch(() => { /* silent */ })
        }
        if (e.es_venta_potencial && montoMxn) {
          const emoji = e.idioma === 'en' ? '🇺🇸💰' : '💰'
          toast.success(`${emoji} Venta detectada`, `$${montoMxn.toFixed(2)} MXN`)
        } else if (e.nivel === 'critico') {
          toast.error('🚨 Evento crítico detectado', e.match.keyword)
        }
      }
    } catch { /* silent */ }
  }, [rateUsd])

  const { estado, idiomaActual } = useVoiceMonitor(handleEvent, true)  // siempre activo

  if (estado === 'no-soportado' || estado === 'error') {
    return (
      <span
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[9px] font-bold uppercase tracking-wider"
        style={{
          background: tema === 'light' ? '#fee2e2' : 'rgba(244,63,94,0.15)',
          color: tema === 'light' ? '#991b1b' : '#fca5a5',
          border: `1px solid ${tema === 'light' ? '#fecaca' : 'rgba(244,63,94,0.3)'}`,
        }}
        title="Mic no disponible — verificar permiso navegador"
      >
        <AlertCircle className="h-3 w-3" />
        Mic
      </span>
    )
  }

  const color = tema === 'light' ? {
    activo: { bg: '#dcfce7', border: '#bbf7d0', text: '#166534' },
    detectado: { bg: '#fef3c7', border: '#fde68a', text: '#92400e' },
  } : {
    activo: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', text: '#34d399' },
    detectado: { bg: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.3)', text: '#fbbf24' },
  }
  const c = estado === 'detectado' ? color.detectado : color.activo

  return (
    <span
      className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[9px] font-bold uppercase tracking-wider"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
      title={ultimoMonto ? `Última venta detectada: $${ultimoMonto.toFixed(2)}` : `Escuchando en ${idiomaActual === 'es' ? 'español' : 'inglés'}`}
    >
      <Mic className={`h-3 w-3 ${estado === 'detectado' ? '' : 'animate-pulse'}`} />
      {idiomaActual === 'en' ? '🇺🇸 EN' : '🇲🇽 ES'}
    </span>
  )
}
