'use client'

/**
 * Sheet que muestra el pedido sugerido por IA.
 * Permite copiar al portapapeles, descargar CSV o abrir WhatsApp con
 * el pedido en texto.
 */

import { useEffect, useState } from 'react'
import { Sparkles, X, Loader2, Copy, Download, Share2, AlertTriangle } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

type ItemPedido = {
  codigo_barras: string | null
  nombre: string
  categoria: string | null
  stock_actual: number
  stock_minimo: number
  ventas_30d: number
  cantidad_sugerida: number
  prioridad: 'alta' | 'media' | 'baja'
  costo_estimado_mxn: number
  justificacion: string
}

type Resp = {
  ok?: boolean
  items?: ItemPedido[]
  total_costo_mxn?: number
  mensaje?: string
  criticos_omitidos?: number
  error?: string
}

export function PedidoSugeridoSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [cargando, setCargando] = useState(false)
  const [data, setData] = useState<Resp | null>(null)

  useEffect(() => {
    if (!open || data || cargando) return
    setCargando(true)
    fetch('/api/ai/pedido-sugerido', { method: 'POST' })
      .then(r => r.json())
      .then(j => setData(j))
      .catch(() => setData({ error: 'Error de red' }))
      .finally(() => setCargando(false))
  }, [open, data, cargando])

  // Bloquea scroll body cuando está abierto
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const items = data?.items ?? []
  const total = data?.total_costo_mxn ?? 0

  const enTextoPlano = () => {
    const lines = [
      `🛒 Pedido sugerido — ${new Date().toLocaleDateString('es-MX')}`,
      `Total estimado: ${formatMoney(total, 'MXN')} (${items.length} productos)`,
      '',
    ]
    const porPrioridad = { alta: [] as ItemPedido[], media: [] as ItemPedido[], baja: [] as ItemPedido[] }
    for (const i of items) porPrioridad[i.prioridad].push(i)
    for (const p of ['alta', 'media', 'baja'] as const) {
      const arr = porPrioridad[p]
      if (arr.length === 0) continue
      lines.push(`▼ ${p.toUpperCase()} (${arr.length})`)
      for (const it of arr) {
        const codigo = it.codigo_barras ? `[${it.codigo_barras}] ` : ''
        lines.push(`• ${codigo}${it.nombre} — ${it.cantidad_sugerida} u · ${formatMoney(it.costo_estimado_mxn, 'MXN')}`)
      }
      lines.push('')
    }
    return lines.join('\n')
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enTextoPlano())
      toast.success('Copiado', 'Pega en WhatsApp/notas')
    } catch {
      toast.error('No se pudo copiar', '')
    }
  }

  const descargarCSV = () => {
    const headers = ['Codigo', 'Nombre', 'Categoria', 'Stock', 'Ventas 30d', 'Cantidad sugerida', 'Prioridad', 'Costo MXN', 'Justificacion']
    const escape = (s: string) => '"' + s.replace(/"/g, '""') + '"'
    const rows = items.map(i => [
      i.codigo_barras ?? '',
      i.nombre,
      i.categoria ?? '',
      i.stock_actual,
      i.ventas_30d,
      i.cantidad_sugerida,
      i.prioridad,
      i.costo_estimado_mxn.toFixed(2),
      i.justificacion,
    ].map(c => escape(String(c))).join(','))
    const csv = [headers.map(escape).join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pedido-sugerido-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV descargado', '')
  }

  const compartirWA = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(enTextoPlano())}`
    window.open(url, '_blank')
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full sm:max-w-2xl max-h-[92vh] bg-zinc-950 border border-emerald-500/20 sm:rounded-2xl rounded-t-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <Sparkles className="h-5 w-5 text-cyan-300" />
          <div className="flex-1">
            <h2 className="text-base font-black text-zinc-100">Pedido sugerido por IA</h2>
            <p className="text-[10px] text-zinc-500">Claude Sonnet · basado en stock + ventas 30d</p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full hover:bg-zinc-800 inline-flex items-center justify-center"
          >
            <X className="h-5 w-5 text-zinc-400" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {cargando && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-sm text-zinc-400">Analizando inventario y velocidad de venta…</p>
              <p className="text-[10px] text-zinc-600">Puede tardar 10-20 segundos</p>
            </div>
          )}

          {!cargando && data?.error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 flex gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-300 shrink-0" />
              <div>
                <p className="text-sm font-bold text-rose-200">No se pudo generar</p>
                <p className="text-xs text-rose-200/80 mt-1">{data.error}</p>
              </div>
            </div>
          )}

          {!cargando && data?.mensaje && items.length === 0 && (
            <div className="text-center py-12">
              <p className="text-base text-emerald-200 font-bold">✓ {data.mensaje}</p>
            </div>
          )}

          {!cargando && items.length > 0 && (
            <div className="space-y-3">
              {/* Resumen */}
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 p-3 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Items</p>
                  <p className="text-xl font-black text-zinc-100 tabular-nums">{items.length}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Unidades</p>
                  <p className="text-xl font-black text-cyan-300 tabular-nums">
                    {items.reduce((s, i) => s + i.cantidad_sugerida, 0)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500">Total MXN</p>
                  <p className="text-xl font-black text-emerald-300 tabular-nums">
                    {formatMoney(total, 'MXN')}
                  </p>
                </div>
              </div>

              {data?.criticos_omitidos && data.criticos_omitidos > 0 && (
                <p className="text-[11px] text-amber-300/80 px-1">
                  IA procesó 80 productos. Hay {data.criticos_omitidos} más críticos — vuelve a generar después de hacer este pedido.
                </p>
              )}

              {/* Lista por prioridad */}
              {(['alta', 'media', 'baja'] as const).map(p => {
                const arr = items.filter(i => i.prioridad === p)
                if (arr.length === 0) return null
                const colores = {
                  alta:  { bg: 'bg-rose-500/10',  border: 'border-rose-500/30',  text: 'text-rose-200',  label: 'ALTA' },
                  media: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-200', label: 'MEDIA' },
                  baja:  { bg: 'bg-zinc-700/30',  border: 'border-zinc-700',    text: 'text-zinc-400',  label: 'BAJA' },
                }
                const c = colores[p]
                return (
                  <div key={p} className="space-y-1.5">
                    <div className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border', c.bg, c.border, c.text)}>
                      <span>● {c.label}</span>
                      <span className="opacity-70">({arr.length})</span>
                    </div>
                    {arr.map((it, idx) => (
                      <div key={idx} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1.5">
                              {it.codigo_barras && (
                                <span className="text-[9px] font-mono text-zinc-500">[{it.codigo_barras}]</span>
                              )}
                              <p className="text-sm font-semibold text-zinc-100 truncate">{it.nombre}</p>
                            </div>
                            <p className="text-[10px] text-zinc-500 mt-0.5">
                              Stock {it.stock_actual} · vendido 30d: {it.ventas_30d} {it.categoria ? `· ${it.categoria}` : ''}
                            </p>
                            <p className="text-[10px] text-cyan-300/80 mt-1 italic">{it.justificacion}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-black text-emerald-300 tabular-nums leading-none">
                              {it.cantidad_sugerida}<span className="text-[10px] text-zinc-500"> u</span>
                            </p>
                            <p className="text-[10px] text-zinc-400 tabular-nums mt-0.5">
                              {formatMoney(it.costo_estimado_mxn, 'MXN')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer con acciones */}
        {!cargando && items.length > 0 && (
          <div className="border-t border-zinc-800 p-3 grid grid-cols-3 gap-2">
            <button
              onClick={copiar}
              className="h-11 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-bold inline-flex items-center justify-center gap-1.5 active:scale-95"
            >
              <Copy className="h-4 w-4" /> Copiar
            </button>
            <button
              onClick={descargarCSV}
              className="h-11 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-bold inline-flex items-center justify-center gap-1.5 active:scale-95"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
            <button
              onClick={compartirWA}
              className="h-11 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 active:scale-95"
            >
              <Share2 className="h-4 w-4" /> WhatsApp
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
