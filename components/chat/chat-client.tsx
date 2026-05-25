'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Mic, MicOff, Loader2, Check, AlertCircle } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/utils'
import { hoyEnCabos } from '@/lib/fechas'
import { ConfirmCard, type Draft, type Negocio, type Cuenta } from './confirm-card'

type Mensaje =
  | { id: string; rol: 'user'; tipo: 'foto'; foto_url: string }
  | { id: string; rol: 'user'; tipo: 'voz'; transcripcion: string; audio_url?: string }
  | { id: string; rol: 'system'; tipo: 'pensando' }
  | { id: string; rol: 'assistant'; tipo: 'confirmar'; draft: Draft }
  | { id: string; rol: 'assistant'; tipo: 'guardado'; resumen: string }
  | { id: string; rol: 'assistant'; tipo: 'error'; mensaje: string }

const newId = () => Math.random().toString(36).slice(2)

export function ChatClient({ negocios, cuentas }: { negocios: Negocio[]; cuentas: Cuenta[] }) {
  const router = useRouter()
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [grabando, setGrabando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  const append = (m: Mensaje) => setMensajes((prev) => [...prev, m])
  const replaceLast = (predicate: (m: Mensaje) => boolean, nuevo: Mensaje) => {
    setMensajes((prev) => {
      const idx = [...prev].reverse().findIndex(predicate)
      if (idx === -1) return [...prev, nuevo]
      const realIdx = prev.length - 1 - idx
      return [...prev.slice(0, realIdx), nuevo, ...prev.slice(realIdx + 1)]
    })
  }

  // ---------- FOTO ----------
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // reset para poder elegir la misma foto otra vez
    const fotoUrl = URL.createObjectURL(file)
    append({ id: newId(), rol: 'user', tipo: 'foto', foto_url: fotoUrl })

    const pensandoId = newId()
    append({ id: pensandoId, rol: 'system', tipo: 'pensando' })
    setProcesando(true)

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/ai/parse-ticket', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok || !data.ok) {
        replaceLast(
          (m) => m.id === pensandoId,
          { id: pensandoId, rol: 'assistant', tipo: 'error', mensaje: data.error || 'Falló la lectura' }
        )
        return
      }

      const p = data.parsed
      const fecha = p.fecha ?? hoyEnCabos()
      const tipo: 'gasto' | 'ingreso' =
        p.tipo === 'ingreso' || p.tipo === 'corte_diario' ? 'ingreso' : 'gasto'
      const monto = Number(p.monto_total ?? p.venta_total ?? 0)

      const draft: Draft = {
        tipo,
        monto,
        moneda: p.moneda || 'MXN',
        fecha,
        concepto: p.concepto || 'Foto capturada',
        categoria: p.categoria_sugerida || null,
        negocio_sugerido: p.negocio_sugerido,
        cuenta_sugerida: null,
        metodo_pago: p.metodo_pago_detectado || null,
        metodo_captura: 'foto',
        foto_url: data.foto_url,
        raw_ai_response: p,
      }

      replaceLast(
        (m) => m.id === pensandoId,
        { id: pensandoId, rol: 'assistant', tipo: 'confirmar', draft }
      )
    } catch (e) {
      replaceLast(
        (m) => m.id === pensandoId,
        {
          id: pensandoId,
          rol: 'assistant',
          tipo: 'error',
          mensaje: e instanceof Error ? e.message : 'Error de red',
        }
      )
    } finally {
      setProcesando(false)
    }
  }

  // ---------- VOZ ----------
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      const recorder = new MediaRecorder(stream, { mimeType })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        await handleAudio(blob, mimeType)
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setGrabando(true)
    } catch {
      append({
        id: newId(),
        rol: 'assistant',
        tipo: 'error',
        mensaje: 'No se pudo acceder al micrófono. Permite el acceso en Safari.',
      })
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    setGrabando(false)
  }

  const handleAudio = async (blob: Blob, mimeType: string) => {
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm'
    const file = new File([blob], `nota.${ext}`, { type: mimeType })

    const pensandoId = newId()
    append({ id: pensandoId, rol: 'system', tipo: 'pensando' })
    setProcesando(true)

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/ai/parse-voice', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok || !data.ok) {
        replaceLast(
          (m) => m.id === pensandoId,
          {
            id: pensandoId,
            rol: 'assistant',
            tipo: 'error',
            mensaje: data.error || 'Falló la transcripción',
          }
        )
        return
      }

      // Insertamos el mensaje del usuario con la transcripción ANTES del pensando
      setMensajes((prev) => {
        const idx = prev.findIndex((m) => m.id === pensandoId)
        if (idx === -1) return prev
        const userMsg: Mensaje = {
          id: newId(),
          rol: 'user',
          tipo: 'voz',
          transcripcion: data.transcripcion,
          audio_url: data.audio_url,
        }
        return [...prev.slice(0, idx), userMsg, ...prev.slice(idx)]
      })

      const p = data.parsed
      if (p.pregunta_clarificadora && !p.monto) {
        replaceLast(
          (m) => m.id === pensandoId,
          {
            id: pensandoId,
            rol: 'assistant',
            tipo: 'error',
            mensaje: p.pregunta_clarificadora,
          }
        )
        return
      }

      const draft: Draft = {
        tipo: (p.tipo as 'gasto' | 'ingreso') || 'gasto',
        monto: Number(p.monto || 0),
        moneda: (p.moneda as 'MXN' | 'USD') || 'MXN',
        fecha: p.fecha_mencionada || hoyEnCabos(),
        concepto: p.concepto || data.transcripcion.slice(0, 80),
        categoria: p.categoria_sugerida || null,
        negocio_sugerido: p.negocio_mencionado,
        cuenta_sugerida: p.cuenta_mencionada,
        metodo_captura: 'voz',
        audio_url: data.audio_url,
        raw_ai_response: { transcripcion: data.transcripcion, ...p },
      }

      replaceLast(
        (m) => m.id === pensandoId,
        { id: pensandoId, rol: 'assistant', tipo: 'confirmar', draft }
      )
    } catch (e) {
      replaceLast(
        (m) => m.id === pensandoId,
        {
          id: pensandoId,
          rol: 'assistant',
          tipo: 'error',
          mensaje: e instanceof Error ? e.message : 'Error de red',
        }
      )
    } finally {
      setProcesando(false)
    }
  }

  // ---------- Guardado ----------
  const handleSaved = (cardId: string, draft: Draft) => {
    const resumen = `${draft.tipo === 'gasto' ? '−' : '+'}${formatMoney(draft.monto, draft.moneda)} · ${draft.concepto}`
    replaceLast(
      (m) => m.id === cardId,
      { id: cardId, rol: 'assistant', tipo: 'guardado', resumen }
    )
    router.refresh()
  }

  return (
    <div className="flex flex-col min-h-[calc(100vh-9rem)]">
      {/* Mensajes */}
      <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
        {mensajes.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-zinc-500">Toca la cámara o el micrófono para empezar.</p>
            <div className="flex flex-col items-start gap-2 text-xs text-zinc-400 max-w-xs mx-auto">
              <p>📷 <strong>Cámara</strong>: toma foto de ticket, corte, screenshot de ads.</p>
              <p>🎤 <strong>Micrófono</strong>: dicta &quot;pagué 350 de gasolina con la cuenta de Sergio&quot;.</p>
            </div>
          </div>
        )}

        {mensajes.map((m) => {
          if (m.rol === 'user' && m.tipo === 'foto') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="relative max-w-[220px] rounded-2xl overflow-hidden border bg-white dark:bg-zinc-900">
                  <Image src={m.foto_url} alt="ticket" width={220} height={220} className="object-cover" unoptimized />
                </div>
              </div>
            )
          }
          if (m.rol === 'user' && m.tipo === 'voz') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-emerald-600 text-white p-3 text-sm">
                  🎤 {m.transcripcion}
                </div>
              </div>
            )
          }
          if (m.rol === 'system' && m.tipo === 'pensando') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-zinc-100 dark:bg-zinc-800 p-3 text-sm inline-flex items-center gap-2 text-zinc-600 dark:text-zinc-300">
                  <Loader2 className="h-4 w-4 animate-spin" /> Analizando…
                </div>
              </div>
            )
          }
          if (m.rol === 'assistant' && m.tipo === 'confirmar') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="w-full max-w-md">
                  <ConfirmCard
                    draft={m.draft}
                    negocios={negocios}
                    cuentas={cuentas}
                    onSaved={() => handleSaved(m.id, m.draft)}
                    onCancel={() =>
                      setMensajes((prev) => prev.filter((x) => x.id !== m.id))
                    }
                  />
                </div>
              </div>
            )
          }
          if (m.rol === 'assistant' && m.tipo === 'guardado') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 p-3 text-sm inline-flex items-center gap-2">
                  <Check className="h-4 w-4" /> Guardado · {m.resumen}
                </div>
              </div>
            )
          }
          if (m.rol === 'assistant' && m.tipo === 'error') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 p-3 text-sm inline-flex items-start gap-2 max-w-[85%]">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{m.mensaje}</span>
                </div>
              </div>
            )
          }
          return null
        })}

        <div ref={chatBottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="sticky bottom-16 left-0 right-0 z-20 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur px-4 py-3"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center gap-3 justify-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={procesando || grabando}
            aria-label="Tomar foto"
            className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 disabled:opacity-40 transition-colors"
          >
            <Camera className="h-6 w-6" />
          </button>

          <button
            type="button"
            onClick={grabando ? stopRecording : startRecording}
            disabled={procesando}
            aria-label={grabando ? 'Detener grabación' : 'Grabar nota de voz'}
            className={cn(
              'inline-flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition-colors',
              grabando
                ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300'
            )}
          >
            {grabando ? <MicOff className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
          </button>

          <div className="h-14 w-14" />
        </div>
        {grabando && (
          <p className="text-center text-xs text-red-600 mt-2 animate-pulse">Grabando… toca para terminar</p>
        )}
      </div>
    </div>
  )
}
