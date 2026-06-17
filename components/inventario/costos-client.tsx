'use client'

/**
 * UI para sugerir costos a productos sin costo cargado.
 * Procesa en batches de 25, muestra sugerencias con confianza,
 * usuario revisa y aplica todas las aceptadas con un tap.
 */

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Check, Loader2, AlertTriangle, RefreshCw, Save, X } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { actualizarProducto } from '@/app/(app)/inventario/actions'

type Producto = {
  id: string
  nombre: string
  precio_mxn: number
  categoria: string | null
  codigo_barras: string | null
}

type SugerenciaCosto = {
  producto_id: string
  nombre: string
  precio_mxn: number
  costo_sugerido_mxn: number | null
  margen_esperado_pct: number | null
  confianza: 'alta' | 'media' | 'baja'
  razon: string
}

const BATCH = 25

export function CostosClient({ productos }: { productos: Producto[] }) {
  const router = useRouter()
  const [sugerencias, setSugerencias] = useState<Map<string, SugerenciaCosto>>(new Map())
  const [aceptadas, setAceptadas] = useState<Set<string>>(new Set())
  const [editadas, setEditadas] = useState<Map<string, number>>(new Map())
  const [procesando, setProcesando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [progreso, setProgreso] = useState<{ actual: number; total: number } | null>(null)

  const totalBatches = Math.ceil(productos.length / BATCH)

  const sugerirTodos = async () => {
    if (procesando) return
    if (productos.length === 0) return
    setProcesando(true)
    setProgreso({ actual: 0, total: totalBatches })

    const nuevasSug = new Map(sugerencias)
    let errores = 0

    for (let i = 0; i < productos.length; i += BATCH) {
      const batch = productos.slice(i, i + BATCH)
      setProgreso({ actual: Math.floor(i / BATCH) + 1, total: totalBatches })
      try {
        const r = await fetch('/api/ai/sugerir-costos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ producto_ids: batch.map(p => p.id) }),
        })
        const data = await r.json()
        if (data.sugerencias) {
          for (const s of data.sugerencias) {
            nuevasSug.set(s.producto_id, s)
          }
        } else if (data.error) {
          errores++
        }
      } catch {
        errores++
      }
    }

    setSugerencias(nuevasSug)
    // Auto-aceptar las de confianza alta + media
    const autoAceptadas = new Set<string>()
    for (const s of nuevasSug.values()) {
      if (s.confianza === 'alta' || s.confianza === 'media') autoAceptadas.add(s.producto_id)
    }
    setAceptadas(autoAceptadas)
    setProcesando(false)
    setProgreso(null)
    toast.success(`✓ ${nuevasSug.size} sugerencias listas`, errores > 0 ? `${errores} batches con error` : 'Revisa y aplica las que quieras')
  }

  const toggleAceptar = (id: string) => {
    setAceptadas(prev => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id)
      return nuevo
    })
  }

  const editarCosto = (id: string, valor: number) => {
    setEditadas(prev => {
      const nuevo = new Map(prev)
      nuevo.set(id, valor)
      return nuevo
    })
  }

  const aplicarSeleccionadas = async () => {
    if (guardando) return
    if (aceptadas.size === 0) return toast.error('Nada que aplicar', 'Acepta al menos una sugerencia')
    setGuardando(true)
    let exitos = 0, fallos = 0
    for (const id of aceptadas) {
      const editada = editadas.get(id)
      const original = sugerencias.get(id)
      const costo = editada ?? original?.costo_sugerido_mxn
      if (costo == null) continue
      const r = await actualizarProducto({ producto_id: id, costo_mxn: costo })
      if (r.error) fallos++; else exitos++
    }
    setGuardando(false)
    toast.success(`✓ ${exitos} costos guardados`, fallos > 0 ? `${fallos} fallos` : 'Listo')
    router.refresh()
  }

  const productosOrdenados = useMemo(() => {
    // Primero los que tienen sugerencia, ordenados por confianza
    const conSug = productos.filter(p => sugerencias.has(p.id))
    const sinSug = productos.filter(p => !sugerencias.has(p.id))
    const orderConf = { alta: 0, media: 1, baja: 2 }
    conSug.sort((a, b) => {
      const sa = sugerencias.get(a.id)!
      const sb = sugerencias.get(b.id)!
      return orderConf[sa.confianza] - orderConf[sb.confianza]
    })
    return [...conSug, ...sinSug]
  }, [productos, sugerencias])

  if (productos.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
        <Check className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
        <p className="text-base font-bold text-emerald-200">¡Todos los productos tienen costo!</p>
        <p className="text-xs text-zinc-500 mt-1">Tu margen real está al 100%.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header con acciones masivas */}
      <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 via-emerald-500/5 to-transparent p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500/30 to-emerald-500/30 inline-flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-zinc-100">Sugerencia con IA</p>
            <p className="text-[10px] text-zinc-500">
              Claude analiza tu catálogo (con costos similares) y sugiere costos realistas para los faltantes.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={sugerirTodos}
          disabled={procesando}
          className="w-full h-11 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 text-white font-bold text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98]"
        >
          {procesando ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Procesando batch {progreso?.actual}/{progreso?.total}…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              {sugerencias.size > 0 ? 'Reintentar IA para faltantes' : `Sugerir todos (${productos.length} productos · ${totalBatches} batches)`}
            </>
          )}
        </button>
        {sugerencias.size > 0 && (
          <p className="text-[10px] text-zinc-500 text-center">
            {sugerencias.size} sugerencias listas · {aceptadas.size} aceptadas
          </p>
        )}
      </div>

      {/* Sticky botón guardar */}
      {aceptadas.size > 0 && (
        <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-[var(--bg-base)]/95 backdrop-blur-xl border-y border-emerald-500/20">
          <button
            type="button"
            onClick={aplicarSeleccionadas}
            disabled={guardando}
            className="w-full h-11 rounded-xl bg-emerald-600 text-white font-bold text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-[0.98]"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar {aceptadas.size} costo{aceptadas.size === 1 ? '' : 's'} aceptado{aceptadas.size === 1 ? '' : 's'}
          </button>
        </div>
      )}

      {/* Lista de productos con sugerencias */}
      <ul className="space-y-1.5">
        {productosOrdenados.map(p => {
          const sug = sugerencias.get(p.id)
          const aceptada = aceptadas.has(p.id)
          const editado = editadas.get(p.id)
          const costoFinal = editado ?? sug?.costo_sugerido_mxn ?? null
          const margenFinal = costoFinal != null && p.precio_mxn > 0
            ? ((p.precio_mxn - costoFinal) / p.precio_mxn) * 100
            : null
          return (
            <li
              key={p.id}
              className={cn(
                'rounded-xl border p-2.5 transition-all',
                sug
                  ? aceptada
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : 'border-zinc-700 bg-zinc-900/40'
                  : 'border-zinc-800 bg-zinc-900/20 opacity-60'
              )}
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-zinc-100 truncate">{p.nombre}</p>
                  <p className="text-[10px] text-zinc-500">
                    {p.categoria ?? '—'} · precio {formatMoney(p.precio_mxn, 'MXN')}
                  </p>
                  {sug && (
                    <p className="text-[10px] text-cyan-300/80 italic mt-0.5">💡 {sug.razon}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {sug ? (
                    <>
                      <span className={cn(
                        'inline-flex items-center px-1.5 h-4 rounded-full text-[9px] font-bold uppercase tracking-wider mb-1',
                        sug.confianza === 'alta' && 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30',
                        sug.confianza === 'media' && 'bg-amber-500/20 text-amber-200 border border-amber-500/30',
                        sug.confianza === 'baja' && 'bg-zinc-700/40 text-zinc-300 border border-zinc-700',
                      )}>
                        {sug.confianza}
                      </span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={editado ?? sug.costo_sugerido_mxn ?? 0}
                          onChange={e => editarCosto(p.id, Number(e.target.value) || 0)}
                          className="w-20 h-8 px-2 rounded-md border border-zinc-700 bg-zinc-900 text-xs font-bold tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          onClick={() => toggleAceptar(p.id)}
                          className={cn(
                            'h-8 w-8 rounded-md inline-flex items-center justify-center active:scale-95',
                            aceptada
                              ? 'bg-emerald-600 text-white'
                              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          )}
                        >
                          {aceptada ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                        </button>
                      </div>
                      {margenFinal != null && (
                        <p className={cn(
                          'text-[10px] font-bold tabular-nums mt-0.5',
                          margenFinal >= 30 ? 'text-emerald-300' : margenFinal >= 10 ? 'text-amber-300' : 'text-rose-300'
                        )}>
                          margen {margenFinal.toFixed(0)}%
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-[10px] text-zinc-500">Sin sugerencia</span>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {/* Empty state info */}
      {sugerencias.size === 0 && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/40 p-4 text-center text-xs text-zinc-500">
          <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-amber-400" />
          <p>Tap el botón de arriba para que la IA sugiera costos a los {productos.length} productos.</p>
          <p className="mt-1 text-[10px]">Cada batch tarda ~3-5 seg. Total estimado: {(totalBatches * 4).toFixed(0)}s</p>
        </div>
      )}
    </div>
  )
}
