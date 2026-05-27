'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X, ChevronRight } from 'lucide-react'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import type { EventoCalendario } from '@/lib/calendario'

type CeldaDia = { dia: number | null; fecha: string | null }

export function CalendarioGrid({
  celdas,
  porDia,
  hoy,
}: {
  celdas: CeldaDia[]
  porDia: Record<string, EventoCalendario[]>
  hoy: string
}) {
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)
  const eventosDelDia: EventoCalendario[] = diaSeleccionado ? (porDia[diaSeleccionado] ?? []) : []

  return (
    <>
      <div className="card p-3 space-y-1">
        {/* Días de la semana */}
        <div className="grid grid-cols-7 gap-1 text-center">
          {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
            <div key={i} className="text-[10px] font-bold text-zinc-500 py-1">{d}</div>
          ))}
        </div>
        {/* Días del mes */}
        <div className="grid grid-cols-7 gap-1">
          {celdas.map((c, i) => {
            if (!c.dia) return <div key={i} className="aspect-square" />
            const evs = porDia[c.fecha!] ?? []
            const esHoy = c.fecha === hoy
            const haEv = evs.length > 0
            // Compute color stripes
            const colors = Array.from(new Set(evs.map((e) => e.color))).slice(0, 4)

            return (
              <button
                type="button"
                key={i}
                onClick={() => haEv && setDiaSeleccionado(c.fecha)}
                className={cn(
                  'aspect-square p-1 rounded-md flex flex-col items-stretch text-[10px] border transition-all',
                  esHoy
                    ? 'border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                    : haEv
                      ? 'border-[var(--border-subtle)] bg-[var(--bg-input)] hover:border-cyan-500/50 hover:bg-cyan-500/5 active:scale-95'
                      : 'border-transparent cursor-default'
                )}
              >
                <span className={cn('text-center font-bold', esHoy ? 'text-cyan-300' : haEv ? 'text-zinc-200' : 'text-zinc-500')}>
                  {c.dia}
                </span>
                {haEv && (
                  <>
                    <div className="flex-1 flex flex-wrap gap-0.5 items-center justify-center mt-0.5">
                      {evs.slice(0, 3).map((e, idx) => (
                        <span key={idx} className="text-[9px]">{e.emoji}</span>
                      ))}
                      {evs.length > 3 && <span className="text-[8px] text-zinc-500 font-bold">+{evs.length - 3}</span>}
                    </div>
                    {/* Stripes de colores */}
                    <div className="flex gap-0.5 mt-auto">
                      {colors.map((color, ci) => (
                        <div key={ci} className={cn('h-0.5 flex-1 rounded-full', color.replace('text-', 'bg-'))} />
                      ))}
                    </div>
                  </>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Sheet del día */}
      {diaSeleccionado && (
        <DiaSheet
          fecha={diaSeleccionado}
          eventos={eventosDelDia}
          esHoy={diaSeleccionado === hoy}
          onClose={() => setDiaSeleccionado(null)}
        />
      )}
    </>
  )
}

function DiaSheet({
  fecha,
  eventos,
  esHoy,
  onClose,
}: {
  fecha: string
  eventos: EventoCalendario[]
  esHoy: boolean
  onClose: () => void
}) {
  // Agrupar por tipo
  const porTipo = new Map<string, EventoCalendario[]>()
  for (const e of eventos) {
    if (!porTipo.has(e.tipo)) porTipo.set(e.tipo, [])
    porTipo.get(e.tipo)!.push(e)
  }
  const totalMxn = eventos.filter((e) => e.moneda !== 'USD').reduce((s, e) => s + (e.monto ?? 0), 0)
  const totalUsd = eventos.filter((e) => e.moneda === 'USD').reduce((s, e) => s + (e.monto ?? 0), 0)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm animate-toast-in"
      />
      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-[var(--bg-base)] border-t border-[var(--border-glow)] shadow-2xl max-h-[80vh] overflow-y-auto animate-toast-in">
        <div className="sticky top-0 bg-[var(--bg-base)] border-b border-[var(--border-subtle)] p-4 flex items-center justify-between">
          <div className="leading-tight">
            <p className="text-base font-black text-white capitalize">
              {formatearFecha(fecha, 'EEEE, dd MMMM')}
              {esHoy && <span className="ml-2 chip chip-cyan text-[9px]">HOY</span>}
            </p>
            <p className="text-[11px] text-zinc-500">
              {eventos.length} evento{eventos.length !== 1 ? 's' : ''}
              {totalMxn > 0 && ` · ${formatMoney(totalMxn, 'MXN')}`}
              {totalUsd > 0 && ` · ${formatMoney(totalUsd, 'USD')}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-full border border-[var(--border-subtle)] text-zinc-400 hover:text-white inline-flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {Array.from(porTipo.entries()).map(([tipo, evs]) => (
            <section key={tipo} className="space-y-1.5">
              <p className="label-caps">
                {tipo === 'gasto_fijo' && '📅 Gastos fijos'}
                {tipo === 'cuenta_por_pagar' && '💸 Por pagar'}
                {tipo === 'evento' && '🎉 Eventos'}
                {tipo === 'tarea' && '✅ Tareas'}
                {tipo === 'nomina' && '👥 Nómina'}
                {tipo === 'multa' && '⚠️ Multas'}
                {' '}({evs.length})
              </p>
              <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
                {evs.map((e, i) => (
                  <li key={i}>
                    <Link
                      href={e.link}
                      onClick={onClose}
                      className="flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)] transition-colors"
                    >
                      <span className="text-xl shrink-0">{e.emoji}</span>
                      <div className="flex-1 min-w-0 leading-tight">
                        <p className="text-sm font-bold text-white truncate">{e.titulo}</p>
                        {e.negocio && <p className="text-[10px] text-zinc-500 truncate">🏢 {e.negocio}</p>}
                        {e.estado && <p className="text-[10px] text-zinc-500">Estado: {e.estado}</p>}
                      </div>
                      {e.monto && (
                        <p className={cn('text-sm font-bold tabular-nums', e.color)}>
                          {formatMoney(e.monto, e.moneda || 'MXN')}
                        </p>
                      )}
                      <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
