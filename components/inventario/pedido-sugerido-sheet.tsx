'use client'

/**
 * Sheet que muestra el pedido sugerido por IA.
 * Permite copiar formato visual, descargar CSV completo y compartir por
 * WhatsApp con formato listo para proveedor.
 */

import { useEffect, useState } from 'react'
import { Sparkles, X, Loader2, Copy, Download, MessageCircle, AlertTriangle, Package, TrendingUp, ShoppingCart } from 'lucide-react'
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
  margen_pct?: number | null
}

type Resp = {
  ok?: boolean
  items?: ItemPedido[]
  total_costo_mxn?: number
  presupuesto_mxn?: number
  porcentaje_uso?: number
  estrategia?: string | null
  motor?: 'claude-sonnet' | 'reglas-fallback'
  criticos_omitidos?: number
  mensaje?: string
  error?: string
}

const PRESUPUESTOS = [5000, 10000, 20000, 50000, 100000]

const PRIORIDAD_META = {
  alta:  { emoji: '🔴', label: 'Urgente',  card: 'border-rose-500/40 bg-rose-500/5',   pill: 'bg-rose-500/20 text-rose-200 border-rose-500/40' },
  media: { emoji: '🟡', label: 'Reabastecer', card: 'border-amber-500/30 bg-amber-500/5', pill: 'bg-amber-500/20 text-amber-200 border-amber-500/40' },
  baja:  { emoji: '⚪', label: 'Preventivo', card: 'border-zinc-700 bg-zinc-900/40',    pill: 'bg-zinc-700/40 text-zinc-300 border-zinc-700' },
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
  const [presupuesto, setPresupuesto] = useState<number>(20000)
  const [presupuestoLocked, setPresupuestoLocked] = useState(false)

  const generar = (mxn: number) => {
    if (cargando) return
    setCargando(true)
    setData(null)
    setPresupuestoLocked(true)
    fetch('/api/ai/pedido-sugerido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presupuesto_mxn: mxn }),
    })
      .then(r => r.json())
      .then(j => setData(j))
      .catch(() => setData({ error: 'Error de red' }))
      .finally(() => setCargando(false))
  }

  // No bloqueamos body — usamos overscroll-contain en el scroll interno
  // para evitar el bug de scroll en iOS que oculta productos.

  if (!open) return null

  const items = data?.items ?? []
  const total = data?.total_costo_mxn ?? 0
  const totalUnidades = items.reduce((s, i) => s + i.cantidad_sugerida, 0)
  const conteoAlta = items.filter(i => i.prioridad === 'alta').length
  const conteoMedia = items.filter(i => i.prioridad === 'media').length
  const conteoBaja = items.filter(i => i.prioridad === 'baja').length

  // ──────────────────────────────────────────────────────────────
  // FORMATOS DE EXPORT
  // ──────────────────────────────────────────────────────────────

  /** Formato bonito para copiar al portapapeles (texto simple bien estructurado) */
  const formatoCopiar = () => {
    const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
    const out: string[] = []
    out.push(`PEDIDO SUGERIDO — ${fecha}`)
    out.push('━'.repeat(40))
    out.push(`Items: ${items.length}   Unidades: ${totalUnidades}   Total: ${formatMoney(total, 'MXN')}`)
    out.push('')
    for (const p of ['alta', 'media', 'baja'] as const) {
      const arr = items.filter(i => i.prioridad === p)
      if (arr.length === 0) continue
      out.push(`${PRIORIDAD_META[p].label.toUpperCase()} (${arr.length})`)
      out.push('─'.repeat(30))
      for (const it of arr) {
        const cod = it.codigo_barras ? ` [${it.codigo_barras}]` : ''
        out.push(`• ${it.nombre}${cod}`)
        out.push(`  ${it.cantidad_sugerida}u · ${formatMoney(it.costo_estimado_mxn, 'MXN')}`)
      }
      out.push('')
    }
    return out.join('\n').trim()
  }

  /** Formato para WhatsApp con emojis y negritas — listo para mandar al proveedor */
  const formatoWhatsApp = () => {
    const fecha = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
    const out: string[] = []
    out.push(`🛒 *PEDIDO SUGERIDO*`)
    out.push(`📅 ${fecha}`)
    out.push(`💼 Cvu Pharmacy`)
    out.push('')
    for (const p of ['alta', 'media', 'baja'] as const) {
      const arr = items.filter(i => i.prioridad === p)
      if (arr.length === 0) continue
      const m = PRIORIDAD_META[p]
      out.push(`━━━━━━━━━━━━━━━━`)
      out.push(`${m.emoji} *${m.label.toUpperCase()}* (${arr.length})`)
      out.push(`━━━━━━━━━━━━━━━━`)
      out.push('')
      for (const it of arr) {
        out.push(`📦 *${it.nombre}*`)
        if (it.codigo_barras) out.push(`🏷 \`${it.codigo_barras}\``)
        out.push(`📊 Pedir: *${it.cantidad_sugerida} unidades*`)
        out.push(`💰 ${formatMoney(it.costo_estimado_mxn, 'MXN')}`)
        if (it.ventas_30d > 0) out.push(`📈 Vendió ${it.ventas_30d}u en 30 días`)
        out.push('')
      }
    }
    out.push(`━━━━━━━━━━━━━━━━`)
    out.push(`💰 *TOTAL: ${formatMoney(total, 'MXN')}*`)
    out.push(`📦 ${items.length} productos`)
    out.push(`🛍 ${totalUnidades} unidades`)
    out.push('')
    out.push('¿Cuál es la disponibilidad? ¡Gracias!')
    return out.join('\n').trim()
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(formatoCopiar())
      toast.success('Copiado', 'Pega donde quieras')
    } catch {
      toast.error('No se pudo copiar', '')
    }
  }

  const descargarCSV = () => {
    const headers = ['Codigo', 'Nombre', 'Categoria', 'Stock', 'Stock Min', 'Ventas 30d', 'Cantidad sugerida', 'Prioridad', 'Costo MXN', 'Justificacion']
    const escape = (s: string) => '"' + s.replace(/"/g, '""') + '"'
    const rows = items.map(i => [
      i.codigo_barras ?? '',
      i.nombre,
      i.categoria ?? '',
      i.stock_actual,
      i.stock_minimo,
      i.ventas_30d,
      i.cantidad_sugerida,
      i.prioridad,
      i.costo_estimado_mxn.toFixed(2),
      i.justificacion,
    ].map(c => escape(String(c))).join(','))
    const csv = '﻿' + [headers.map(escape).join(','), ...rows].join('\n') // BOM para Excel
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pedido-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV descargado', `${items.length} productos`)
  }

  const compartirWA = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(formatoWhatsApp())}`
    window.open(url, '_blank')
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ height: '100dvh' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet — siempre full screen, scroll interno aislado */}
      <div
        className="relative w-full mx-auto sm:max-w-2xl bg-zinc-950 border-t sm:border border-emerald-500/20 sm:rounded-2xl rounded-t-3xl flex flex-col flex-1 sm:my-8 overflow-hidden"
      >
        {/* Header sticky */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-950">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500/30 to-emerald-500/30 inline-flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-zinc-100 leading-tight">Pedido sugerido</h2>
            <p className="text-[10px] text-zinc-500">Generado por IA · stock + ventas 30d</p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full hover:bg-zinc-800 inline-flex items-center justify-center shrink-0"
          >
            <X className="h-5 w-5 text-zinc-400" />
          </button>
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto px-3 py-3"
          style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
        >
          {cargando && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
              <p className="text-sm text-zinc-300 font-bold">Claude Sonnet analizando…</p>
              <p className="text-[10px] text-zinc-500">Considerando margen, rotación, presupuesto y categorías. ~30 seg.</p>
            </div>
          )}

          {!cargando && !data && !presupuestoLocked && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/10 via-emerald-500/5 to-transparent p-4 space-y-2">
                <p className="text-sm font-black text-zinc-100">¿Cuánto puedes gastar?</p>
                <p className="text-[11px] text-zinc-500">Claude Sonnet optimizará el pedido para maximizar tu ROI dentro de ese presupuesto.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {PRESUPUESTOS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPresupuesto(p)}
                    className={cn(
                      'h-14 rounded-xl border transition-all active:scale-95',
                      presupuesto === p
                        ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600'
                    )}
                  >
                    <p className="text-base font-black tabular-nums">{formatMoney(p, 'MXN').replace('.00', '')}</p>
                    <p className="text-[9px] text-zinc-500 uppercase mt-0.5">{p <= 5000 ? 'mínimo' : p <= 20000 ? 'normal' : p <= 50000 ? 'amplio' : 'grande'}</p>
                  </button>
                ))}
                <div className="h-14 rounded-xl border border-zinc-700 bg-zinc-900 flex items-center px-2 gap-1">
                  <span className="text-zinc-500 text-sm">$</span>
                  <input
                    type="number"
                    value={presupuesto}
                    onChange={e => setPresupuesto(Number(e.target.value) || 0)}
                    className="w-full h-full bg-transparent text-sm font-bold tabular-nums focus:outline-none"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => generar(presupuesto)}
                className="w-full h-14 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 text-white font-black inline-flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/30 active:scale-[0.98]"
              >
                <Sparkles className="h-5 w-5" />
                Generar pedido con IA
              </button>
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
            <div className="text-center py-16">
              <p className="text-5xl mb-3">✅</p>
              <p className="text-base text-emerald-200 font-bold">{data.mensaje}</p>
              <p className="text-xs text-zinc-500 mt-2">Inventario sano, no hace falta pedir nada.</p>
            </div>
          )}

          {!cargando && items.length > 0 && (
            <div className="space-y-3">
              {/* Estrategia IA */}
              {data?.estrategia && (
                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 flex gap-2">
                  <Sparkles className="h-4 w-4 text-cyan-300 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold">Estrategia Claude Sonnet</p>
                    <p className="text-xs text-zinc-300 mt-0.5">{data.estrategia}</p>
                  </div>
                </div>
              )}
              {data?.motor === 'reglas-fallback' && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-[10px] text-amber-200">
                  ⚠ IA no respondió, usando reglas determinísticas como respaldo.
                </div>
              )}

              {/* Resumen visual con presupuesto */}
              <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-transparent p-3 space-y-2">
                <div className="grid grid-cols-3 gap-1 text-center">
                  <div className="flex flex-col items-center">
                    <Package className="h-4 w-4 text-zinc-500 mb-1" />
                    <p className="text-xl font-black text-zinc-100 tabular-nums leading-none">{items.length}</p>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-500 mt-0.5">Items</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <ShoppingCart className="h-4 w-4 text-zinc-500 mb-1" />
                    <p className="text-xl font-black text-cyan-300 tabular-nums leading-none">{totalUnidades}</p>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-500 mt-0.5">Unidades</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <TrendingUp className="h-4 w-4 text-zinc-500 mb-1" />
                    <p className="text-lg font-black text-emerald-300 tabular-nums leading-none">{formatMoney(total, 'MXN')}</p>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-500 mt-0.5">Total</p>
                  </div>
                </div>
                {data?.presupuesto_mxn && (
                  <div className="pt-2 border-t border-zinc-800">
                    <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                      <span>Presupuesto: {formatMoney(data.presupuesto_mxn, 'MXN')}</span>
                      <span>Usado: {data.porcentaje_uso ?? 0}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                        style={{ width: `${Math.min(100, data.porcentaje_uso ?? 0)}%` }}
                      />
                    </div>
                  </div>
                )}
                {/* Chips de prioridad */}
                <div className="flex gap-1.5 mt-3 justify-center flex-wrap">
                  {conteoAlta > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold text-rose-200">
                      🔴 {conteoAlta} urgentes
                    </span>
                  )}
                  {conteoMedia > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                      🟡 {conteoMedia} medios
                    </span>
                  )}
                  {conteoBaja > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-700/40 border border-zinc-700 px-2 py-0.5 text-[10px] font-bold text-zinc-300">
                      ⚪ {conteoBaja} preventivos
                    </span>
                  )}
                </div>
              </div>

              {/* Lista por prioridad */}
              {(['alta', 'media', 'baja'] as const).map(p => {
                const arr = items.filter(i => i.prioridad === p)
                if (arr.length === 0) return null
                const m = PRIORIDAD_META[p]
                return (
                  <section key={p} className="space-y-1.5">
                    {/* Encabezado de prioridad */}
                    <div className="flex items-center gap-1.5 sticky top-0 z-[1] py-1 bg-zinc-950">
                      <span className="text-base">{m.emoji}</span>
                      <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">{m.label}</span>
                      <span className={cn('inline-flex items-center px-1.5 h-4 rounded-full text-[9px] font-bold border', m.pill)}>
                        {arr.length}
                      </span>
                      <span className="text-[9px] text-zinc-500 ml-auto tabular-nums">
                        {formatMoney(arr.reduce((s, i) => s + i.costo_estimado_mxn, 0), 'MXN')}
                      </span>
                    </div>

                    {/* Cards */}
                    {arr.map((it, idx) => (
                      <article
                        key={`${p}-${idx}`}
                        className={cn('rounded-xl border p-2.5', m.card)}
                      >
                        {/* Top: nombre + cantidad gigante */}
                        <div className="flex items-start gap-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-zinc-100 leading-tight">{it.nombre}</p>
                            {it.codigo_barras && (
                              <p className="text-[9px] font-mono text-zinc-600 mt-0.5">
                                🏷 {it.codigo_barras}
                              </p>
                            )}
                          </div>
                          {/* Cantidad bloque */}
                          <div className="text-center shrink-0 rounded-lg bg-zinc-950 border border-emerald-500/30 px-2.5 py-1.5 min-w-[58px]">
                            <p className="text-2xl font-black text-emerald-300 tabular-nums leading-none">{it.cantidad_sugerida}</p>
                            <p className="text-[9px] uppercase tracking-wider text-zinc-500 mt-0.5 font-bold">unid.</p>
                          </div>
                        </div>

                        {/* Bottom: chips informativos */}
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          {/* Costo destacado */}
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-1.5 h-5 text-[10px] font-bold text-emerald-300 tabular-nums">
                            💰 {formatMoney(it.costo_estimado_mxn, 'MXN')}
                          </span>
                          {/* Stock actual */}
                          <span className={cn(
                            'inline-flex items-center gap-0.5 rounded-md border px-1.5 h-5 text-[10px] font-bold',
                            it.stock_actual === 0
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-300'
                          )}>
                            📦 Stock {it.stock_actual}
                          </span>
                          {/* Ventas si hay */}
                          {it.ventas_30d > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 px-1.5 h-5 text-[10px] font-bold text-cyan-200">
                              📈 {it.ventas_30d}/30d
                            </span>
                          )}
                          {/* Categoría */}
                          {it.categoria && (
                            <span className="text-[9px] text-zinc-500 ml-auto">
                              {it.categoria}
                            </span>
                          )}
                        </div>

                        {/* Justificación */}
                        <p className="text-[10px] text-zinc-500 italic mt-1.5 leading-tight">
                          💡 {it.justificacion}
                        </p>
                      </article>
                    ))}
                  </section>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer con acciones */}
        {!cargando && items.length > 0 && (
          <div className="border-t border-zinc-800 p-2.5 grid grid-cols-3 gap-1.5 bg-zinc-950 safe-bottom"
               style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
            <button
              onClick={copiar}
              className="h-12 rounded-xl bg-zinc-800 text-zinc-200 text-[11px] font-bold inline-flex flex-col items-center justify-center gap-0.5 active:scale-95"
            >
              <Copy className="h-4 w-4" />
              Copiar
            </button>
            <button
              onClick={descargarCSV}
              className="h-12 rounded-xl bg-zinc-800 text-zinc-200 text-[11px] font-bold inline-flex flex-col items-center justify-center gap-0.5 active:scale-95"
            >
              <Download className="h-4 w-4" />
              CSV
            </button>
            <button
              onClick={compartirWA}
              className="h-12 rounded-xl bg-emerald-600 text-white text-[11px] font-bold inline-flex flex-col items-center justify-center gap-0.5 active:scale-95 shadow-lg shadow-emerald-500/30"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
