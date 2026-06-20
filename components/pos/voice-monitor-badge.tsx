'use client'

/**
 * Badge en el POS que muestra el estado del monitor de voz.
 * Se integra al header del PosClient.
 */

import { useState, useCallback, useEffect } from 'react'
import { Mic, MicOff, AlertCircle } from 'lucide-react'
import { useVoiceMonitor } from '@/lib/voice/use-voice-monitor'
import { guardarVoiceEvent } from '@/app/(app)/pos/voice-actions'
import { toast } from '@/components/ui/toast'

const LS_VOICE_ENABLED = 'pos_voice_enabled_v1'

export function VoiceMonitorBadge({ tema }: { tema: 'light' | 'dark' }) {
  // Default: habilitado, pero usuario puede apagarlo
  const [enabled, setEnabled] = useState<boolean>(true)
  const [ultimoEvento, setUltimoEvento] = useState<string | null>(null)

  // Cargar preferencia
  useEffect(() => {
    const stored = localStorage.getItem(LS_VOICE_ENABLED)
    if (stored !== null) setEnabled(stored === '1')
  }, [])
  useEffect(() => {
    localStorage.setItem(LS_VOICE_ENABLED, enabled ? '1' : '0')
  }, [enabled])

  const handleKeyword = useCallback(async (match: { keyword: string; categoria: 'precio' | 'cancelacion' | 'devolucion' | 'problema' | 'fiado' | 'general'; transcript: string; confidence: number }) => {
    setUltimoEvento(`${match.categoria}: "${match.keyword}"`)
    // Guardar evento + análisis IA en background
    try {
      const r = await guardarVoiceEvent({
        keyword: match.keyword,
        categoria: match.categoria,
        transcript: match.transcript,
        confidence: match.confidence || 0,
      })
      if (r.ok && r.id) {
        // Disparar análisis IA
        fetch('/api/ai/analizar-voz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voice_event_id: r.id }),
        }).catch(() => { /* silent */ })

        // Mostrar feedback al usuario (Tania)
        const emoji = match.categoria === 'precio' ? '💲'
          : match.categoria === 'cancelacion' ? '🚫'
          : match.categoria === 'devolucion' ? '↩️'
          : match.categoria === 'problema' ? '😡'
          : match.categoria === 'fiado' ? '📝' : 'ℹ️'
        toast.success(`${emoji} ${match.categoria}`, 'Detectado y registrado')
      }
    } catch { /* silent */ }
  }, [])

  const { estado } = useVoiceMonitor(handleKeyword, enabled)

  // Si no está soportado, no mostrar nada
  if (estado === 'no-soportado') return null

  const color = tema === 'light' ? {
    activo: { bg: '#dcfce7', border: '#bbf7d0', text: '#166534' },
    detectado: { bg: '#fef3c7', border: '#fde68a', text: '#92400e' },
    error: { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' },
    inactivo: { bg: '#f4f4f5', border: '#e4e4e7', text: '#52525b' },
  } : {
    activo: { bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.3)', text: '#34d399' },
    detectado: { bg: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.3)', text: '#fbbf24' },
    error: { bg: 'rgba(244,63,94,0.15)', border: 'rgba(244,63,94,0.3)', text: '#fca5a5' },
    inactivo: { bg: 'rgba(63,63,70,0.4)', border: '#3f3f46', text: '#a1a1aa' },
  }

  const c = !enabled ? color.inactivo
    : estado === 'detectado' ? color.detectado
    : estado === 'error' ? color.error
    : color.activo

  return (
    <button
      type="button"
      onClick={() => setEnabled(v => !v)}
      className="hidden sm:inline-flex items-center gap-1 h-7 px-2 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all active:scale-95"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
      title={!enabled ? 'Monitor de voz desactivado — tap para activar'
        : estado === 'detectado' ? `Detectado: ${ultimoEvento ?? ''}`
        : estado === 'error' ? 'Error del monitor de voz'
        : 'Monitor de voz activo (analiza keywords sin grabar)'}
    >
      {!enabled ? (
        <MicOff className="h-3 w-3" />
      ) : estado === 'error' ? (
        <AlertCircle className="h-3 w-3" />
      ) : (
        <Mic className={`h-3 w-3 ${estado === 'detectado' ? '' : 'animate-pulse'}`} />
      )}
      {!enabled ? 'OFF'
        : estado === 'detectado' ? 'CAP'
        : estado === 'error' ? 'ERR'
        : 'IA'}
    </button>
  )
}
