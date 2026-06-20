'use client'

/**
 * Hook que escucha continuamente con Web Speech API y detecta keywords.
 *
 * Comportamiento:
 *   - SpeechRecognition siempre escuchando (continuous=true)
 *   - Si detecta una keyword → guarda el contexto (los últimos 30s de transcript)
 *   - NO guarda audio, solo texto
 *   - Si hay error o se desconecta, intenta reconectar
 *   - Si el navegador no soporta, devuelve { soportado: false }
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { buscarKeyword, normalizar, type KeywordMatch } from './keywords'

type Estado = 'inactivo' | 'escuchando' | 'detectado' | 'error' | 'no-soportado'

type SpeechRecognitionEvent = {
  results: SpeechRecognitionResultList
  resultIndex: number
}
type SpeechRecognitionResultList = {
  length: number
  [index: number]: { isFinal: boolean; 0: { transcript: string; confidence: number }; length: number }
}
type SpeechRecognitionType = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export function useVoiceMonitor(
  onKeywordDetected: (match: KeywordMatch & { transcript: string; confidence: number }) => void,
  enabled: boolean = true,
) {
  const [estado, setEstado] = useState<Estado>('inactivo')
  const [ultimaActividad, setUltimaActividad] = useState<number>(0)
  const recRef = useRef<SpeechRecognitionType | null>(null)
  const bufferRef = useRef<string[]>([])  // últimas frases para contexto
  const reconnectRef = useRef<number>(0)

  const detenerCallback = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.stop() } catch { /* ignore */ }
      recRef.current = null
    }
    setEstado('inactivo')
  }, [])

  useEffect(() => {
    if (!enabled) {
      detenerCallback()
      return
    }

    // Detectar soporte
    const W = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionType
      webkitSpeechRecognition?: new () => SpeechRecognitionType
    }
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition
    if (!SR) {
      setEstado('no-soportado')
      return
    }

    const iniciar = () => {
      try {
        const rec = new SR()
        rec.continuous = true
        rec.interimResults = true
        rec.lang = 'es-MX'

        rec.onresult = (event) => {
          // Procesa solo los resultados nuevos
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i]
            const transcript = res[0].transcript
            const confidence = res[0].confidence

            // Mantener buffer rolling de últimas 5 frases
            if (res.isFinal) {
              bufferRef.current.push(transcript)
              if (bufferRef.current.length > 5) bufferRef.current.shift()
            }

            // Buscar keyword en el transcript actual
            const match = buscarKeyword(transcript)
            if (match) {
              // Contexto = últimas frases + actual
              const contextoCompleto = [...bufferRef.current, transcript].join(' ')
              setEstado('detectado')
              setUltimaActividad(Date.now())
              onKeywordDetected({
                ...match,
                transcript: normalizar(contextoCompleto).slice(0, 500),
                confidence,
              })
              // Volver a "escuchando" después de 2 seg para indicador visual
              setTimeout(() => setEstado('escuchando'), 2000)
            }
          }
        }

        rec.onerror = (e) => {
          // Errores comunes: "no-speech", "audio-capture", "not-allowed"
          if (e.error === 'not-allowed') {
            setEstado('error')
            return  // No reintentar — usuario rechazó permiso
          }
          // Resto: reintenta automáticamente
        }

        rec.onend = () => {
          // El reconocedor se reinicia solo cada cierto tiempo, lo relanzamos
          if (enabled && reconnectRef.current < 100) {
            reconnectRef.current++
            setTimeout(() => {
              try { rec.start() } catch { /* probable: ya está iniciado */ }
            }, 500)
          }
        }

        rec.start()
        recRef.current = rec
        setEstado('escuchando')
      } catch {
        setEstado('error')
      }
    }

    iniciar()

    return () => {
      detenerCallback()
    }
  }, [enabled, onKeywordDetected, detenerCallback])

  return { estado, ultimaActividad }
}
