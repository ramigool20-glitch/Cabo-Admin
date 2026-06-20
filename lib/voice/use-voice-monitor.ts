'use client'

/**
 * Hook v2: bilingüe + detección de montos + niveles.
 *
 * NO graba audio. Solo procesa texto local del navegador.
 *
 * Funcionamiento:
 *   1. SpeechRecognition continuo en es-MX
 *   2. Si detecta palabras inglesas → cambia a en-US automáticamente
 *   3. Para cada transcript final, busca:
 *      - Keywords es o en → categoría + nivel
 *      - Monto hablado → cuánto y en qué moneda
 *   4. Si hay venta + monto → es_venta_potencial = true
 *   5. Callback al cliente con todo el contexto
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { buscarKeyword, normalizar, type KeywordMatch, type Categoria } from './keywords'
import { buscarKeywordIngles, detectarIngles } from './keywords-en'
import { detectarMonto, esVentaProbable, type MontoDetectado } from './detector-montos'

type Estado = 'inactivo' | 'escuchando' | 'detectado' | 'error' | 'no-soportado'
type Nivel = 'nota' | 'venta' | 'conversacion' | 'critico'

export type VoiceEvent = {
  match: KeywordMatch
  transcript: string
  confidence: number
  idioma: 'es' | 'en' | 'mixto' | 'desconocido'
  nivel: Nivel
  monto: MontoDetectado | null
  es_venta_potencial: boolean
}

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

// Categorías que elevan el nivel
function calcularNivel(categoria: Categoria, esVenta: boolean): Nivel {
  if (categoria === 'problema') return 'critico'
  if (esVenta) return 'venta'
  if (categoria === 'cancelacion' || categoria === 'devolucion' || categoria === 'fiado') return 'conversacion'
  return 'nota'
}

export function useVoiceMonitor(
  onEvent: (e: VoiceEvent) => void,
  enabled: boolean = true,
) {
  const [estado, setEstado] = useState<Estado>('inactivo')
  const [idiomaActual, setIdiomaActual] = useState<'es' | 'en'>('es')
  const [ultimaActividad, setUltimaActividad] = useState<number>(0)
  const recRef = useRef<SpeechRecognitionType | null>(null)
  const bufferRef = useRef<string[]>([])
  const reconnectRef = useRef<number>(0)
  const ultimoInglesAtRef = useRef<number>(0)

  const detener = useCallback(() => {
    if (recRef.current) {
      try { recRef.current.stop() } catch { /* ignore */ }
      recRef.current = null
    }
    setEstado('inactivo')
  }, [])

  useEffect(() => {
    if (!enabled) { detener(); return }

    const W = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionType
      webkitSpeechRecognition?: new () => SpeechRecognitionType
    }
    const SR = W.SpeechRecognition || W.webkitSpeechRecognition
    if (!SR) { setEstado('no-soportado'); return }

    const iniciar = (lang: 'es' | 'en') => {
      try {
        const rec = new SR()
        rec.continuous = true
        rec.interimResults = true
        rec.lang = lang === 'es' ? 'es-MX' : 'en-US'
        setIdiomaActual(lang)

        rec.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const res = event.results[i]
            const transcript = res[0].transcript
            const confidence = res[0].confidence

            if (res.isFinal) {
              bufferRef.current.push(transcript)
              if (bufferRef.current.length > 5) bufferRef.current.shift()
            }

            // Detectar idioma
            const esIngles = detectarIngles(transcript)
            if (esIngles) {
              ultimoInglesAtRef.current = Date.now()
              // Si estamos en español y detectamos inglés, switch
              if (lang === 'es') {
                try { rec.stop() } catch { /* ignore */ }
                setTimeout(() => iniciar('en'), 200)
                return
              }
            } else {
              // 30 seg sin inglés y estamos en en → vuelve a es
              if (lang === 'en' && Date.now() - ultimoInglesAtRef.current > 30000) {
                try { rec.stop() } catch { /* ignore */ }
                setTimeout(() => iniciar('es'), 200)
                return
              }
            }

            // Buscar keyword (intenta en ambos idiomas)
            const matchEs = buscarKeyword(transcript)
            const matchEn = buscarKeywordIngles(transcript)
            const match: KeywordMatch | null = matchEs || matchEn

            // Detectar monto
            const monto = detectarMonto(transcript)
            const esVenta = esVentaProbable(transcript) && monto !== null

            // Solo emitir evento si hay keyword O hay monto detectado en contexto de venta
            if (match || esVenta) {
              const finalMatch: KeywordMatch = match || {
                keyword: monto?.texto_origen ?? 'monto',
                categoria: 'general' as Categoria,
              }
              const contextoCompleto = [...bufferRef.current, transcript].join(' ')
              const idioma = esIngles ? 'en' : 'es'
              const nivel = calcularNivel(finalMatch.categoria, esVenta)

              setEstado('detectado')
              setUltimaActividad(Date.now())
              onEvent({
                match: finalMatch,
                transcript: contextoCompleto.slice(0, 500),
                confidence: confidence || 0,
                idioma,
                nivel,
                monto,
                es_venta_potencial: esVenta,
              })
              setTimeout(() => setEstado('escuchando'), 2000)
            }
          }
        }

        rec.onerror = (e) => {
          if (e.error === 'not-allowed') {
            setEstado('error')
            return
          }
        }

        rec.onend = () => {
          if (enabled && reconnectRef.current < 1000) {
            reconnectRef.current++
            setTimeout(() => {
              try { rec.start() } catch { /* ya está iniciado */ }
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

    iniciar('es')
    return () => { detener() }
  }, [enabled, onEvent, detener])

  return { estado, idiomaActual, ultimaActividad }
}
