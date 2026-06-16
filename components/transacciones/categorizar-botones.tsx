'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Sugerido = { id: string; nombre: string; razon: string }
type Negocio = { id: string; nombre: string }

export function CategorizarBotones({
  txId,
  sugeridos,
  todos,
  categoriaPropuesta,
}: {
  txId: string
  sugeridos: Sugerido[]
  todos: Negocio[]
  categoriaPropuesta: string | null
}) {
  const router = useRouter()
  const [verMas, setVerMas] = useState(false)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const asignar = async (negocio_id: string, nombre: string) => {
    setError(null)
    setEnviando(negocio_id)
    try {
      const res = await fetch('/api/transacciones/categorizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tx_id: txId,
          negocio_id,
          categoria: categoriaPropuesta ?? 'ventas',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al guardar')
      setOk(nombre)
      // Pequeño delay para que vea el ✓ y luego rebota a /transacciones
      setTimeout(() => router.push('/transacciones'), 600)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
      setEnviando(null)
    }
  }

  const sugeridosIds = new Set(sugeridos.map((s) => s.id))
  const otros = todos.filter((n) => !sugeridosIds.has(n.id))

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">
        Toca uno para asignar
      </p>

      {sugeridos.map((s) => {
        const isLoading = enviando === s.id
        const isOk = ok === s.nombre
        return (
          <button
            key={s.id}
            type="button"
            disabled={!!enviando}
            onClick={() => asignar(s.id, s.nombre)}
            className={cn(
              'w-full h-16 px-4 rounded-2xl border-2 font-semibold text-left flex items-center justify-between transition-colors',
              isOk
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-cyan-500',
              !!enviando && !isLoading && !isOk && 'opacity-40'
            )}
          >
            <span className="flex flex-col">
              <span className="text-base">{s.nombre}</span>
              <span className="text-[10px] text-zinc-500 font-normal">{s.razon}</span>
            </span>
            {isOk ? (
              <Check className="h-6 w-6 text-emerald-400" />
            ) : isLoading ? (
              <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
            ) : (
              <span className="text-cyan-400 text-xl">→</span>
            )}
          </button>
        )
      })}

      {otros.length > 0 && !verMas && (
        <button
          type="button"
          onClick={() => setVerMas(true)}
          className="w-full h-12 px-4 rounded-xl border border-dashed border-[var(--border-subtle)] text-sm text-zinc-400 flex items-center justify-center gap-2"
        >
          <ChevronDown className="h-4 w-4" />
          Ver los otros {otros.length} negocios
        </button>
      )}

      {verMas && (
        <div className="space-y-2">
          {otros.map((n) => {
            const isLoading = enviando === n.id
            const isOk = ok === n.nombre
            return (
              <button
                key={n.id}
                type="button"
                disabled={!!enviando}
                onClick={() => asignar(n.id, n.nombre)}
                className={cn(
                  'w-full h-12 px-4 rounded-xl border text-left flex items-center justify-between text-sm',
                  isOk
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-card)]/40',
                  !!enviando && !isLoading && !isOk && 'opacity-40'
                )}
              >
                <span>{n.nombre}</span>
                {isOk ? <Check className="h-4 w-4 text-emerald-400" /> : isLoading ? <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" /> : null}
              </button>
            )
          })}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400 text-center">{error}</p>
      )}
    </div>
  )
}
