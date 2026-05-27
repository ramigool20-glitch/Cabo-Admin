'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight, Calendar as CalIcon, Check } from 'lucide-react'
import { RANGOS, type RangoId } from '@/lib/rangos'
import { cn } from '@/lib/utils'

function fmtDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseDay(s: string | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function RangoSelector({
  actual,
  customDesde,
  customHasta,
}: {
  actual: RangoId
  customDesde?: string
  customHasta?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const [showCustom, setShowCustom] = useState(actual === 'custom')
  const [desde, setDesde] = useState<string>(customDesde ?? '')
  const [hasta, setHasta] = useState<string>(customHasta ?? '')
  const [mesVista, setMesVista] = useState(() => {
    const d = parseDay(customDesde) ?? new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const aplicar = (id: RangoId, d?: string, h?: string) => {
    const params = new URLSearchParams(sp.toString())
    params.set('rango', id)
    if (id === 'custom' && d && h) {
      params.set('desde', d)
      params.set('hasta', h)
    } else {
      params.delete('desde')
      params.delete('hasta')
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const handleSelect = (id: RangoId) => {
    if (id === 'custom') {
      setShowCustom((v) => !v)
    } else {
      setShowCustom(false)
      aplicar(id)
    }
  }

  const aplicarCustom = () => {
    if (desde && hasta) {
      // Normalizar orden
      const d = desde < hasta ? desde : hasta
      const h = desde < hasta ? hasta : desde
      aplicar('custom', d, h)
    }
  }

  // Grid del mes
  const grid = useMemo(() => {
    const año = mesVista.getFullYear()
    const mes = mesVista.getMonth()
    const inicio = new Date(año, mes, 1)
    const fin = new Date(año, mes + 1, 0)
    const primerDow = inicio.getDay()
    const dias: Array<{ dia: number | null; fecha: string | null }> = []
    for (let i = 0; i < primerDow; i++) dias.push({ dia: null, fecha: null })
    for (let d = 1; d <= fin.getDate(); d++) {
      dias.push({ dia: d, fecha: fmtDay(new Date(año, mes, d)) })
    }
    return dias
  }, [mesVista])

  const onClickDia = (fecha: string) => {
    if (!desde || (desde && hasta)) {
      setDesde(fecha)
      setHasta('')
    } else if (desde && !hasta) {
      if (fecha < desde) {
        setHasta(desde)
        setDesde(fecha)
      } else {
        setHasta(fecha)
      }
    }
  }

  const enRango = (fecha: string): 'inicio' | 'fin' | 'medio' | 'fuera' => {
    if (!desde) return 'fuera'
    if (fecha === desde && (!hasta || desde === hasta)) return 'inicio'
    if (fecha === hasta) return 'fin'
    if (fecha === desde) return 'inicio'
    if (hasta && fecha > desde && fecha < hasta) return 'medio'
    return 'fuera'
  }

  const tituloMes = mesVista.toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'America/Mazatlan' })

  const ahora = new Date()
  const presetCustom = (dias: number) => {
    const hastaD = fmtDay(ahora)
    const desdeD = fmtDay(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - dias + 1))
    setDesde(desdeD)
    setHasta(hastaD)
    setMesVista(new Date(ahora.getFullYear(), ahora.getMonth(), 1))
  }

  return (
    <div className="space-y-2">
      {/* Chips horizontales */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
        {RANGOS.map((r) => {
          const active = actual === r.id
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => handleSelect(r.id)}
              className={cn(
                'h-8 px-3 rounded-full text-xs font-medium border shrink-0 transition-all whitespace-nowrap',
                active
                  ? 'border-cyan-500 bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                  : 'border-[var(--border-subtle)] bg-[var(--bg-card)] text-zinc-400 hover:text-zinc-200 hover:border-cyan-500/40'
              )}
            >
              {r.emoji && <span className="mr-1">{r.emoji}</span>}
              {r.label}
            </button>
          )
        })}
      </div>

      {showCustom && (
        <div className="card-glow border-cyan-500/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-cyan-300 inline-flex items-center gap-1.5">
              <CalIcon className="h-3.5 w-3.5" />
              Rango personalizado
            </p>
            <button
              type="button"
              onClick={() => setShowCustom(false)}
              className="text-[10px] text-zinc-500 hover:text-white px-2 py-1 rounded"
            >
              ✕
            </button>
          </div>

          {/* Presets relativos */}
          <div className="flex flex-wrap gap-1">
            <PresetBtn label="3 días" onClick={() => presetCustom(3)} />
            <PresetBtn label="7 días" onClick={() => presetCustom(7)} />
            <PresetBtn label="14 días" onClick={() => presetCustom(14)} />
            <PresetBtn label="30 días" onClick={() => presetCustom(30)} />
            <PresetBtn label="60 días" onClick={() => presetCustom(60)} />
            <PresetBtn label="90 días" onClick={() => presetCustom(90)} />
          </div>

          {/* Inputs manuales (también editable) */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[9px] uppercase tracking-wider text-zinc-500">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => { setDesde(e.target.value); setHasta('') }}
                className="input-base w-full h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] uppercase tracking-wider text-zinc-500">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="input-base w-full h-9 text-xs"
              />
            </div>
          </div>

          {/* Calendario visual */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMesVista(new Date(mesVista.getFullYear(), mesVista.getMonth() - 1, 1))}
                className="h-6 w-6 rounded text-zinc-400 hover:text-cyan-300 inline-flex items-center justify-center"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <p className="text-xs font-bold text-white capitalize">{tituloMes}</p>
              <button
                type="button"
                onClick={() => setMesVista(new Date(mesVista.getFullYear(), mesVista.getMonth() + 1, 1))}
                className="h-6 w-6 rounded text-zinc-400 hover:text-cyan-300 inline-flex items-center justify-center"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
                <div key={i} className="text-[9px] font-bold text-zinc-500 py-0.5">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {grid.map((c, i) => {
                if (!c.dia) return <div key={i} className="aspect-square" />
                const estado = enRango(c.fecha!)
                const esHoy = c.fecha === fmtDay(new Date())
                return (
                  <button
                    type="button"
                    key={i}
                    onClick={() => onClickDia(c.fecha!)}
                    className={cn(
                      'aspect-square text-[10px] font-bold transition-colors relative',
                      estado === 'inicio' && hasta && desde !== hasta && 'bg-cyan-500 text-white rounded-l-md',
                      estado === 'inicio' && (!hasta || desde === hasta) && 'bg-cyan-500 text-white rounded-md',
                      estado === 'fin' && desde !== hasta && 'bg-cyan-500 text-white rounded-r-md',
                      estado === 'medio' && 'bg-cyan-500/30 text-cyan-100',
                      estado === 'fuera' && (esHoy ? 'text-cyan-300 border border-cyan-500/40 rounded-md' : 'text-zinc-400 hover:bg-[var(--bg-card-hover)] rounded-md')
                    )}
                  >
                    {c.dia}
                  </button>
                )
              })}
            </div>
            <p className="text-[10px] text-zinc-500 text-center">
              Toca un día para inicio, otro para fin
            </p>
          </div>

          {/* Resumen */}
          {(desde || hasta) && (
            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-[var(--border-subtle)]">
              <span className="text-zinc-400">
                {desde && hasta
                  ? `${desde} → ${hasta}`
                  : desde
                    ? `${desde} → ...`
                    : ''}
              </span>
              {desde && hasta && (
                <span className="text-cyan-400 font-bold tabular-nums">
                  {diasEntre(desde, hasta)} día{diasEntre(desde, hasta) !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={aplicarCustom}
            disabled={!desde || !hasta}
            className="btn-primary w-full h-9 text-xs"
          >
            <Check className="h-3.5 w-3.5" />
            Aplicar rango
          </button>
        </div>
      )}
    </div>
  )
}

function PresetBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 px-2.5 rounded-md text-[10px] font-bold border border-[var(--border-subtle)] bg-[var(--bg-card)] text-zinc-300 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors"
    >
      {label}
    </button>
  )
}

function diasEntre(a: string, b: string): number {
  const da = parseDay(a)
  const db = parseDay(b)
  if (!da || !db) return 0
  return Math.abs(Math.round((db.getTime() - da.getTime()) / (24 * 60 * 60 * 1000))) + 1
}
