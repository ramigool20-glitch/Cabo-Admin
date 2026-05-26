'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Camera, Mic, MicOff, Loader2, Check, AlertCircle, Bot, Send, Image as ImageIcon,
} from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/utils'
import { hoyEnCabos } from '@/lib/fechas'
import { ConfirmCard, type Draft, type Negocio, type Cuenta } from './confirm-card'
import { ConfirmGastoFijoCard } from './confirm-gasto-fijo-card'
import { ConfirmFacturaCard, type FacturaDraft } from './confirm-factura-card'
import type { ChatMessage, ChatDraft, ChatGastoFijoDraft } from '@/lib/ai/prompts'

type Profile = { id: string; nombre: string }

type Mensaje =
  | { id: string; rol: 'user'; tipo: 'foto'; foto_url: string }
  | { id: string; rol: 'user'; tipo: 'voz'; transcripcion: string; audio_url?: string }
  | { id: string; rol: 'user'; tipo: 'texto'; texto: string }
  | { id: string; rol: 'system'; tipo: 'pensando' }
  | { id: string; rol: 'assistant'; tipo: 'texto'; texto: string }
  | { id: string; rol: 'assistant'; tipo: 'confirmar'; draft: Draft; introTexto?: string }
  | { id: string; rol: 'assistant'; tipo: 'confirmar-gasto-fijo'; draft: ChatGastoFijoDraft; introTexto?: string }
  | { id: string; rol: 'assistant'; tipo: 'confirmar-factura'; draft: FacturaDraft; introTexto?: string }
  | { id: string; rol: 'assistant'; tipo: 'guardado'; resumen: string }
  | { id: string; rol: 'assistant'; tipo: 'error'; mensaje: string }

const newId = () => Math.random().toString(36).slice(2)

function draftFromChatDraft(d: ChatDraft): Draft {
  return {
    tipo: d.tipo,
    monto: d.monto,
    moneda: d.moneda,
    fecha: d.fecha,
    concepto: d.concepto,
    categoria: d.categoria,
    negocio_sugerido: d.negocio_sugerido,
    cuenta_sugerida: d.cuenta_sugerida,
    metodo_pago: d.metodo_pago,
    metodo_captura: 'foto',
  }
}

export function ChatClient({
  negocios,
  cuentas,
  perfiles,
}: {
  negocios: Negocio[]
  cuentas: Cuenta[]
  perfiles: Profile[]
}) {
  const router = useRouter()
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [conversation, setConversation] = useState<ChatMessage[]>([])
  const [texto, setTexto] = useState('')
  const [grabando, setGrabando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)       // cámara directa
  const galleryInputRef = useRef<HTMLInputElement>(null)   // galería de fotos
  const textInputRef = useRef<HTMLTextAreaElement>(null)

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

  // ---------- TEXTO ----------
  const handleSendText = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const t = texto.trim()
    if (!t || procesando) return

    setTexto('')
    append({ id: newId(), rol: 'user', tipo: 'texto', texto: t })

    const newConv: ChatMessage[] = [...conversation, { role: 'user', content: t }]
    setConversation(newConv)

    const pensandoId = newId()
    append({ id: pensandoId, rol: 'system', tipo: 'pensando' })
    setProcesando(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newConv }),
      })
      const data = await res.json()

      if (!res.ok) {
        replaceLast(
          (m) => m.id === pensandoId,
          { id: pensandoId, rol: 'assistant', tipo: 'error', mensaje: data.error || 'Error desconocido' }
        )
        return
      }

      const reply: string = data.reply || ''
      const chatDraft: ChatDraft | null = data.draft
      const gastoFijoDraft: ChatGastoFijoDraft | null = data.gastoFijoDraft

      if (gastoFijoDraft) {
        replaceLast(
          (m) => m.id === pensandoId,
          { id: pensandoId, rol: 'assistant', tipo: 'confirmar-gasto-fijo', draft: gastoFijoDraft, introTexto: reply }
        )
      } else if (chatDraft) {
        const draft = draftFromChatDraft(chatDraft)
        replaceLast(
          (m) => m.id === pensandoId,
          { id: pensandoId, rol: 'assistant', tipo: 'confirmar', draft, introTexto: reply }
        )
      } else {
        replaceLast(
          (m) => m.id === pensandoId,
          { id: pensandoId, rol: 'assistant', tipo: 'texto', texto: reply || '…' }
        )
      }

      setConversation([...newConv, { role: 'assistant', content: reply }])
    } catch (e) {
      replaceLast(
        (m) => m.id === pensandoId,
        { id: pensandoId, rol: 'assistant', tipo: 'error', mensaje: e instanceof Error ? e.message : 'Error de red' }
      )
    } finally {
      setProcesando(false)
    }
  }

  // ---------- FOTO ----------
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
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
      const monto = Number(p.monto_total ?? p.venta_total ?? 0)

      // ¿Es factura por pagar?
      if (p.es_factura_proveedor === true || p.tipo === 'factura_proveedor') {
        const facturaDraft: FacturaDraft = {
          proveedor: p.proveedor || p.negocio_sugerido || '',
          concepto: p.concepto || 'Factura',
          monto_total: monto,
          moneda: p.moneda || 'MXN',
          fecha_emision: p.fecha || fecha,
          fecha_vencimiento: p.fecha_vencimiento || null,
          negocio_sugerido: p.negocio_sugerido,
          categoria: p.categoria_sugerida || null,
          referencia: p.referencia_factura || null,
          documento_url: data.foto_url || null,
          notas: p.notas || null,
        }
        replaceLast(
          (m) => m.id === pensandoId,
          { id: pensandoId, rol: 'assistant', tipo: 'confirmar-factura', draft: facturaDraft }
        )
        return
      }

      const tipo: 'gasto' | 'ingreso' =
        p.tipo === 'ingreso' || p.tipo === 'corte_diario' ? 'ingreso' : 'gasto'

      const draft: Draft = {
        tipo, monto, moneda: p.moneda || 'MXN', fecha,
        concepto: p.concepto || 'Foto capturada',
        categoria: p.categoria_sugerida || null,
        negocio_sugerido: p.negocio_sugerido, cuenta_sugerida: null,
        metodo_pago: p.metodo_pago_detectado || null,
        metodo_captura: 'foto', foto_url: data.foto_url, raw_ai_response: p,
      }

      replaceLast(
        (m) => m.id === pensandoId,
        { id: pensandoId, rol: 'assistant', tipo: 'confirmar', draft }
      )
    } catch (e) {
      replaceLast(
        (m) => m.id === pensandoId,
        { id: pensandoId, rol: 'assistant', tipo: 'error', mensaje: e instanceof Error ? e.message : 'Error de red' }
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
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
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
        id: newId(), rol: 'assistant', tipo: 'error',
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
          { id: pensandoId, rol: 'assistant', tipo: 'error', mensaje: data.error || 'Falló la transcripción' }
        )
        return
      }

      setMensajes((prev) => {
        const idx = prev.findIndex((m) => m.id === pensandoId)
        if (idx === -1) return prev
        const userMsg: Mensaje = {
          id: newId(), rol: 'user', tipo: 'voz',
          transcripcion: data.transcripcion, audio_url: data.audio_url,
        }
        return [...prev.slice(0, idx), userMsg, ...prev.slice(idx)]
      })

      const p = data.parsed
      if (p.pregunta_clarificadora && !p.monto) {
        replaceLast(
          (m) => m.id === pensandoId,
          { id: pensandoId, rol: 'assistant', tipo: 'error', mensaje: p.pregunta_clarificadora }
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
        { id: pensandoId, rol: 'assistant', tipo: 'error', mensaje: e instanceof Error ? e.message : 'Error de red' }
      )
    } finally {
      setProcesando(false)
    }
  }

  const handleSaved = (cardId: string, draft: Draft) => {
    const resumen = `${draft.tipo === 'gasto' ? '−' : '+'}${formatMoney(draft.monto, draft.moneda)} · ${draft.concepto}`
    replaceLast(
      (m) => m.id === cardId,
      { id: cardId, rol: 'assistant', tipo: 'guardado', resumen }
    )
    router.refresh()
  }

  const sinMensajes = mensajes.length === 0

  const sugerencias = [
    '¿Cuánto llevo gastado este mes?',
    'Pagué 350 de gasolina con MP Sergio',
    'Agrega gasto fijo: renta farmacia $25000 al mes el día 1, paga Sergio',
    'Registra 1500 USD de IV Therapy en Stripe',
  ]

  return (
    <div className="flex flex-col flex-1 min-h-[calc(100vh-9rem)] pb-44">
      {/* Welcome card */}
      {sinMensajes && (
        <div className="px-4 py-4 space-y-3">
          <div className="card-glow p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 shrink-0 shadow-lg shadow-cyan-500/30">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-bold text-white">Asistente de Captura IA</p>
                <p className="text-sm text-zinc-400">
                  Háblame, escríbeme o tómame foto. Te ayudo a registrar y a contestar preguntas sobre la operación.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="card p-3 text-center">
                <p className="text-xl">💬</p>
                <p className="text-[10px] font-bold text-zinc-400 mt-1">Texto</p>
              </div>
              <div className="card p-3 text-center">
                <p className="text-xl">🎤</p>
                <p className="text-[10px] font-bold text-zinc-400 mt-1">Voz</p>
              </div>
              <div className="card p-3 text-center">
                <p className="text-xl">📷</p>
                <p className="text-[10px] font-bold text-zinc-400 mt-1">Foto</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="label-caps">Prueba con</p>
              <div className="space-y-1.5">
                {sugerencias.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setTexto(s)
                      textInputRef.current?.focus()
                    }}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-subtle)] hover:border-cyan-500/40 text-zinc-300 transition-colors"
                  >
                    &ldquo;{s}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mensajes */}
      <div className="flex-1 px-4 py-3 space-y-3">
        {mensajes.map((m) => {
          if (m.rol === 'user' && m.tipo === 'foto') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[240px] rounded-2xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-card)]">
                  <Image src={m.foto_url} alt="ticket" width={240} height={240} className="object-cover" unoptimized />
                </div>
              </div>
            )
          }
          if (m.rol === 'user' && m.tipo === 'voz') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-cyan-500 to-blue-500 text-white p-3 text-sm shadow-lg shadow-cyan-500/20">
                  🎤 {m.transcripcion}
                </div>
              </div>
            )
          }
          if (m.rol === 'user' && m.tipo === 'texto') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-cyan-500 to-blue-500 text-white p-3 text-sm shadow-lg shadow-cyan-500/20 whitespace-pre-wrap">
                  {m.texto}
                </div>
              </div>
            )
          }
          if (m.rol === 'system' && m.tipo === 'pensando') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="card px-3.5 py-2.5 inline-flex items-center gap-2 text-sm text-cyan-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Pensando…</span>
                </div>
              </div>
            )
          }
          if (m.rol === 'assistant' && m.tipo === 'texto') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="card max-w-[85%] px-3.5 py-2.5 text-sm text-zinc-200 whitespace-pre-wrap">
                  {m.texto}
                </div>
              </div>
            )
          }
          if (m.rol === 'assistant' && m.tipo === 'confirmar') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="w-full space-y-2">
                  {m.introTexto && (
                    <div className="card max-w-[85%] px-3.5 py-2.5 text-sm text-zinc-200 whitespace-pre-wrap">
                      {m.introTexto}
                    </div>
                  )}
                  <ConfirmCard
                    draft={m.draft}
                    negocios={negocios}
                    cuentas={cuentas}
                    onSaved={() => handleSaved(m.id, m.draft)}
                    onCancel={() => setMensajes((prev) => prev.filter((x) => x.id !== m.id))}
                  />
                </div>
              </div>
            )
          }
          if (m.rol === 'assistant' && m.tipo === 'confirmar-factura') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="w-full space-y-2">
                  {m.introTexto && (
                    <div className="card max-w-[85%] px-3.5 py-2.5 text-sm text-zinc-200 whitespace-pre-wrap">
                      {m.introTexto}
                    </div>
                  )}
                  <ConfirmFacturaCard
                    draft={m.draft}
                    negocios={negocios}
                    onSaved={() => {
                      const resumen = `Factura por pagar: ${m.draft.proveedor} ${formatMoney(m.draft.monto_total, m.draft.moneda)}${m.draft.fecha_vencimiento ? ` · vence ${m.draft.fecha_vencimiento}` : ''}`
                      replaceLast(
                        (x) => x.id === m.id,
                        { id: m.id, rol: 'assistant', tipo: 'guardado', resumen }
                      )
                      router.refresh()
                    }}
                    onCancel={() => setMensajes((prev) => prev.filter((x) => x.id !== m.id))}
                    onSwitchToTransaction={() => {
                      // Convertir el draft factura a draft transacción normal
                      const txDraft: Draft = {
                        tipo: 'gasto',
                        monto: m.draft.monto_total,
                        moneda: m.draft.moneda,
                        fecha: m.draft.fecha_emision || hoyEnCabos(),
                        concepto: `${m.draft.proveedor} · ${m.draft.concepto}`,
                        categoria: m.draft.categoria,
                        negocio_sugerido: m.draft.negocio_sugerido,
                        cuenta_sugerida: null,
                        metodo_pago: null,
                        metodo_captura: 'foto',
                        foto_url: m.draft.documento_url,
                      }
                      replaceLast(
                        (x) => x.id === m.id,
                        { id: m.id, rol: 'assistant', tipo: 'confirmar', draft: txDraft }
                      )
                    }}
                  />
                </div>
              </div>
            )
          }
          if (m.rol === 'assistant' && m.tipo === 'confirmar-gasto-fijo') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="w-full space-y-2">
                  {m.introTexto && (
                    <div className="card max-w-[85%] px-3.5 py-2.5 text-sm text-zinc-200 whitespace-pre-wrap">
                      {m.introTexto}
                    </div>
                  )}
                  <ConfirmGastoFijoCard
                    draft={m.draft}
                    negocios={negocios.map((n) => ({ id: n.id, nombre: n.nombre }))}
                    cuentas={cuentas.map((c) => ({ id: c.id, nombre: c.nombre, moneda: c.moneda }))}
                    perfiles={perfiles}
                    onSaved={() => {
                      const resumen = `${m.draft.nombre} ${formatMoney(m.draft.monto, m.draft.moneda)} ${m.draft.frecuencia}`
                      replaceLast(
                        (x) => x.id === m.id,
                        { id: m.id, rol: 'assistant', tipo: 'guardado', resumen }
                      )
                      router.refresh()
                    }}
                    onCancel={() => setMensajes((prev) => prev.filter((x) => x.id !== m.id))}
                  />
                </div>
              </div>
            )
          }
          if (m.rol === 'assistant' && m.tipo === 'guardado') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="card border-emerald-500/40 bg-emerald-500/5 px-3.5 py-2.5 inline-flex items-center gap-2 text-sm text-emerald-300">
                  <Check className="h-4 w-4" />
                  Guardado · {m.resumen}
                </div>
              </div>
            )
          }
          if (m.rol === 'assistant' && m.tipo === 'error') {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="card border-rose-500/40 bg-rose-500/5 px-3.5 py-2.5 inline-flex items-start gap-2 text-sm text-rose-300 max-w-[85%]">
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

      {/* Barra de input fija abajo */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]/95 backdrop-blur-xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
      >
        {/* Input de texto */}
        <form onSubmit={handleSendText} className="max-w-3xl mx-auto px-3 pt-3">
          <div className="flex items-end gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-1.5">
            <textarea
              ref={textInputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSendText()
                }
              }}
              placeholder="Escribe o pregunta… ej: pagué 350 de gasolina"
              rows={1}
              disabled={procesando}
              className="flex-1 max-h-32 px-3 py-2.5 bg-transparent text-sm text-white placeholder:text-zinc-500 resize-none focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={procesando || !texto.trim()}
              aria-label="Enviar"
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
            >
              {procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>

        {/* Botones grandes: galería, cámara, mic */}
        <div className="max-w-3xl mx-auto flex items-center justify-center gap-3 px-4 py-3">
          {/* Inputs ocultos */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />

          {/* Galería */}
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={procesando || grabando}
            aria-label="Elegir de galería"
            className="h-11 w-11 inline-flex items-center justify-center rounded-full border border-[var(--border-glow)] bg-[var(--bg-card)] text-purple-300 hover:bg-[var(--bg-card-hover)] disabled:opacity-40 transition-colors"
          >
            <ImageIcon className="h-5 w-5" />
          </button>

          {/* Cámara */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={procesando || grabando}
            aria-label="Tomar foto"
            className="h-11 w-11 inline-flex items-center justify-center rounded-full border border-[var(--border-glow)] bg-[var(--bg-card)] text-cyan-300 hover:bg-[var(--bg-card-hover)] disabled:opacity-40 transition-colors"
          >
            <Camera className="h-5 w-5" />
          </button>

          {/* Mic grande */}
          <button
            type="button"
            onClick={grabando ? stopRecording : startRecording}
            disabled={procesando}
            aria-label={grabando ? 'Detener' : 'Grabar nota de voz'}
            className={cn(
              'h-14 w-14 inline-flex items-center justify-center rounded-full text-white transition-all',
              grabando
                ? 'bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg shadow-rose-500/40 animate-pulse'
                : 'bg-gradient-to-br from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/30 hover:scale-105 disabled:opacity-40'
            )}
          >
            {grabando ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>
        </div>

        {grabando && (
          <p className="text-center text-xs text-rose-400 pb-2 animate-pulse">
            🔴 Grabando… toca para terminar
          </p>
        )}
      </div>
    </div>
  )
}
