'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import type { EventoCalendario } from '@/lib/calendario'
import { CalendarioGrid } from './calendario-grid'

type CeldaDia = { dia: number | null; fecha: string | null }

const TIPOS: { tipo: EventoCalendario['tipo']; label: string; emoji: string }[] = [
  { tipo: 'gasto_fijo', label: 'Gastos', emoji: '📅' },
  { tipo: 'cuenta_por_pagar', label: 'Por pagar', emoji: '💸' },
  { tipo: 'evento', label: 'Eventos', emoji: '🎉' },
  { tipo: 'tarea', label: 'Tareas', emoji: '✅' },
  { tipo: 'multa', label: 'Multas', emoji: '⚠️' },
]

export function CalendarioCliente({
  eventos, celdas, hoy,
}: {
  eventos: EventoCalendario[]
  celdas: CeldaDia[]
  hoy: string
}) {
  const tiposPresentes = useMemo(() => {
    const s = new Set(eventos.map((e) => e.tipo))
    return TIPOS.filter((t) => s.has(t.tipo))
  }, [eventos])

  const [ocultos, setOcultos] = useState<Set<string>>(new Set())
  const toggle = (tipo: string) =>
    setOcultos((prev) => {
      const n = new Set(prev)
      if (n.has(tipo)) n.delete(tipo)
      else n.add(tipo)
      return n
    })

  const filtrados = useMemo(() => eventos.filter((e) => !ocultos.has(e.tipo)), [eventos, ocultos])

  const porDia = useMemo(() => {
    const m: Record<string, EventoCalendario[]> = {}
    for (const e of filtrados) (m[e.fecha] ??= []).push(e)
    return m
  }, [filtrados])

  const totales = useMemo(() => {
    const t = {
      gasto_fijo: { mxn: 0, usd: 0, count: 0 },
      cuenta_por_pagar: { mxn: 0, usd: 0, count: 0 },
      evento: { mxn: 0, usd: 0, count: 0 },
    }
    for (const e of filtrados) {
      const slot = t[e.tipo as keyof typeof t]
      if (slot && e.monto) {
        if (e.moneda === 'USD') slot.usd += e.monto
        else slot.mxn += e.monto
        slot.count++
      }
    }
    return t
  }, [filtrados])

  const hoyEventos = porDia[hoy] ?? []
  const dias = useMemo(() => Object.keys(porDia).sort(), [porDia])

  return (
    <div className="space-y-4">
      {/* Agenda de HOY */}
      <section className="rounded-2xl p-4 bg-gradient-to-br from-cyan-500/15 to-emerald-500/5 border border-cyan-500/30 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-wider text-cyan-300 capitalize">
            📍 Hoy · {formatearFecha(hoy, 'EEEE dd MMM')}
          </p>
          <span className="text-[10px] text-zinc-400">
            {hoyEventos.length} {hoyEventos.length === 1 ? 'pendiente' : 'pendientes'}
          </span>
        </div>
        {hoyEventos.length === 0 ? (
          <p className="text-sm text-zinc-400">Nada agendado para hoy 🎉</p>
        ) : (
          <ul className="space-y-1.5">
            {hoyEventos.map((e, i) => (
              <li key={i}>
                <Link href={e.link} className="flex items-center gap-2 text-sm">
                  <span>{e.emoji}</span>
                  <span className="flex-1 min-w-0 truncate text-white">{e.titulo}</span>
                  {e.monto ? <span className={cn('font-bold tabular-nums text-xs', e.color)}>{formatMoney(e.monto, e.moneda || 'MXN')}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Filtros por tipo */}
      {tiposPresentes.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {tiposPresentes.map((t) => {
            const count = eventos.filter((e) => e.tipo === t.tipo).length
            const off = ocultos.has(t.tipo)
            return (
              <button
                key={t.tipo}
                type="button"
                onClick={() => toggle(t.tipo)}
                className={cn(
                  'inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-xs border transition-colors',
                  off ? 'border-zinc-800 text-zinc-600' : 'border-cyan-500/50 bg-cyan-500/10 text-zinc-100',
                )}
              >
                <span className={cn(off && 'opacity-40')}>{t.emoji}</span>
                <span className={cn(off && 'line-through')}>{t.label}</span>
                <span className="text-[10px] opacity-70">{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Totales del mes (reactivos al filtro) */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3">
          <p className="text-[10px] text-zinc-500">📅 Gastos fijos</p>
          <p className="text-sm font-bold tabular-nums text-blue-400">{formatMoney(totales.gasto_fijo.mxn, 'MXN')}</p>
          {totales.gasto_fijo.usd > 0 && <p className="text-[10px] text-blue-300/70 tabular-nums">+ {formatMoney(totales.gasto_fijo.usd, 'USD')}</p>}
          <p className="text-[10px] text-zinc-500">{totales.gasto_fijo.count} pagos</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-zinc-500">💸 Por pagar</p>
          <p className="text-sm font-bold tabular-nums text-rose-400">{formatMoney(totales.cuenta_por_pagar.mxn, 'MXN')}</p>
          {totales.cuenta_por_pagar.usd > 0 && <p className="text-[10px] text-rose-300/70 tabular-nums">+ {formatMoney(totales.cuenta_por_pagar.usd, 'USD')}</p>}
          <p className="text-[10px] text-zinc-500">{totales.cuenta_por_pagar.count} deudas</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-zinc-500">🎉 Eventos</p>
          <p className="text-sm font-bold tabular-nums text-pink-400">{formatMoney(totales.evento.mxn, 'MXN')}</p>
          {totales.evento.usd > 0 && <p className="text-[10px] text-pink-300/70 tabular-nums">+ {formatMoney(totales.evento.usd, 'USD')}</p>}
          <p className="text-[10px] text-zinc-500">{totales.evento.count} bookings</p>
        </div>
      </div>

      {/* Grid del mes */}
      <CalendarioGrid celdas={celdas} porDia={porDia} hoy={hoy} />
      <p className="text-[10px] text-zinc-500 text-center -mt-2">Toca un día con eventos para ver el detalle</p>

      {/* Detalle del mes */}
      <section className="space-y-2">
        <h2 className="label-caps">Detalle del mes</h2>
        {dias.length === 0 ? (
          <div className="card border-dashed p-8 text-center text-sm text-zinc-500">
            {ocultos.size > 0 ? 'Sin resultados con los filtros activos.' : 'Sin eventos en este mes.'}
          </div>
        ) : (
          <ul className="space-y-2">
            {dias.map((fecha) => {
              const evs = porDia[fecha]
              const esHoy = fecha === hoy
              const esPasado = fecha < hoy
              return (
                <li key={fecha} className={cn(esPasado && 'opacity-50')}>
                  <div className="space-y-1.5">
                    <p className={cn('text-xs font-bold uppercase tracking-wider px-1', esHoy ? 'text-cyan-400' : 'text-zinc-400')}>
                      {formatearFecha(fecha, 'EEEE dd MMM')}{esHoy ? ' · HOY' : ''}
                    </p>
                    <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
                      {evs.map((e, i) => (
                        <li key={i}>
                          <Link href={e.link} className="flex items-center gap-3 p-2.5 hover:bg-[var(--bg-card-hover)]">
                            <span className="text-lg">{e.emoji}</span>
                            <div className="flex-1 min-w-0 leading-tight">
                              <p className="text-sm font-medium text-white truncate">{e.titulo}</p>
                              {e.negocio && <p className="text-[10px] text-zinc-500 truncate">🏢 {e.negocio}</p>}
                            </div>
                            {e.monto ? <p className={cn('text-sm font-bold tabular-nums', e.color)}>{formatMoney(e.monto, e.moneda || 'MXN')}</p> : null}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
