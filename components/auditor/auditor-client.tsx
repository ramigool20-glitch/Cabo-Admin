'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send, Sparkles, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/lib/ai/prompts'

type Mensaje =
  | { id: string; rol: 'user'; texto: string }
  | { id: string; rol: 'assistant'; texto: string; acciones?: string[] }
  | { id: string; rol: 'system'; pensando: true }

const newId = () => Math.random().toString(36).slice(2)

export function AuditorClient({
  bienvenidaInicial,
}: {
  bienvenidaInicial: string
}) {
  const router = useRouter()
  const [mensajes, setMensajes] = useState<Mensaje[]>([
    { id: newId(), rol: 'assistant', texto: bienvenidaInicial },
  ])
  const [conversation, setConversation] = useState<ChatMessage[]>([])
  const [texto, setTexto] = useState('')
  const [procesando, setProcesando] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes])

  const enviar = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const t = texto.trim()
    if (!t || procesando) return

    setTexto('')
    const userMsg: Mensaje = { id: newId(), rol: 'user', texto: t }
    setMensajes((prev) => [...prev, userMsg])
    const newConv: ChatMessage[] = [...conversation, { role: 'user', content: t }]
    setConversation(newConv)

    const pensandoId = newId()
    setMensajes((prev) => [...prev, { id: pensandoId, rol: 'system', pensando: true }])
    setProcesando(true)

    try {
      const res = await fetch('/api/ai/auditor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newConv }),
      })
      const data = await res.json()

      setMensajes((prev) => {
        const filtered = prev.filter((m) => m.id !== pensandoId)
        return [
          ...filtered,
          {
            id: newId(),
            rol: 'assistant',
            texto: data.reply || '…',
            acciones: data.acciones,
          },
        ]
      })

      setConversation([...newConv, { role: 'assistant', content: data.reply || '' }])

      // Refrescar para mostrar cambios (nuevos pendientes, gastos fijos, etc.)
      if (data.acciones?.length > 0) router.refresh()
    } catch (err) {
      setMensajes((prev) => {
        const filtered = prev.filter((m) => m.id !== pensandoId)
        return [
          ...filtered,
          {
            id: newId(),
            rol: 'assistant',
            texto: 'Error: ' + (err instanceof Error ? err.message : 'desconocido'),
          },
        ]
      })
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div className="flex flex-col flex-1 pb-32">
      <div className="px-4 py-3 space-y-3">
        {mensajes.map((m) => {
          if (m.rol === 'user') {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-cyan-500 to-blue-500 text-white p-3 text-sm shadow-lg shadow-cyan-500/20 whitespace-pre-wrap">
                  {m.texto}
                </div>
              </div>
            )
          }
          if (m.rol === 'system' && m.pensando) {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="card px-3.5 py-2.5 inline-flex items-center gap-2 text-sm text-cyan-300">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Auditando…</span>
                </div>
              </div>
            )
          }
          // assistant
          return (
            <div key={m.id} className="flex justify-start">
              <div className="space-y-1.5 max-w-[90%]">
                <div className="card-glow px-3.5 py-2.5 text-sm text-zinc-200 whitespace-pre-wrap">
                  {(m as { texto: string }).texto}
                </div>
                {(m as { acciones?: string[] }).acciones?.map((a, i) => (
                  <div key={i} className="card border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300 inline-flex items-center gap-2">
                    <Check className="h-3 w-3" />
                    {a}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input fijo abajo */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]/95 backdrop-blur-xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <form onSubmit={enviar} className="max-w-3xl mx-auto px-3 pt-3">
          <div className="flex items-end gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-1.5">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  enviar()
                }
              }}
              placeholder="Pregúntale al auditor o responde lo que te pregunte…"
              rows={1}
              disabled={procesando}
              className="flex-1 max-h-32 px-3 py-2.5 bg-transparent text-sm text-white placeholder:text-zinc-500 resize-none focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={procesando || !texto.trim()}
              aria-label="Enviar"
              className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 text-white disabled:opacity-30 shadow-lg shadow-cyan-500/20"
            >
              {procesando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
