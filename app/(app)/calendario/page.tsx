import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha, hoyEnCabos, TZ } from '@/lib/fechas'
import { eventosDelMes, type EventoCalendario } from '@/lib/calendario'
import { formatInTimeZone } from 'date-fns-tz'
import { EmptyState } from '@/components/ui/empty-state'

type SearchParams = { ym?: string }  // formato 2026-05

function parseYM(ym?: string): { año: number; mes: number } {
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const [a, m] = ym.split('-').map(Number)
    return { año: a, mes: m - 1 }
  }
  const ahora = new Date()
  return { año: ahora.getFullYear(), mes: ahora.getMonth() }
}

function fmtYM(año: number, mes: number): string {
  return `${año}-${String(mes + 1).padStart(2, '0')}`
}

export default async function CalendarioPage(
  { searchParams }: { searchParams: Promise<SearchParams> }
) {
  const sp = await searchParams
  const { año, mes } = parseYM(sp.ym)

  const eventos = await eventosDelMes(año, mes)
  const hoy = hoyEnCabos()

  // Agrupar por día
  const porDia = new Map<string, EventoCalendario[]>()
  for (const e of eventos) {
    if (!porDia.has(e.fecha)) porDia.set(e.fecha, [])
    porDia.get(e.fecha)!.push(e)
  }

  const inicio = new Date(año, mes, 1)
  const fin = new Date(año, mes + 1, 0)
  const diasMes = fin.getDate()
  const primerDiaSemana = inicio.getDay() // 0=dom

  // Generar matriz de la grid (con celdas vacías al principio)
  const celdas: { dia: number | null; fecha: string | null }[] = []
  for (let i = 0; i < primerDiaSemana; i++) celdas.push({ dia: null, fecha: null })
  for (let d = 1; d <= diasMes; d++) {
    const fecha = `${año}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    celdas.push({ dia: d, fecha })
  }

  // Totales del mes
  const totales: Record<string, { mxn: number; usd: number; count: number }> = {
    gasto_fijo: { mxn: 0, usd: 0, count: 0 },
    cuenta_por_pagar: { mxn: 0, usd: 0, count: 0 },
    evento: { mxn: 0, usd: 0, count: 0 },
  }
  for (const e of eventos) {
    if (totales[e.tipo] && e.monto) {
      if (e.moneda === 'USD') totales[e.tipo].usd += e.monto
      else totales[e.tipo].mxn += e.monto
      totales[e.tipo].count++
    }
  }

  const prevMes = mes === 0 ? { año: año - 1, mes: 11 } : { año, mes: mes - 1 }
  const nextMes = mes === 11 ? { año: año + 1, mes: 0 } : { año, mes: mes + 1 }
  const tituloMes = formatInTimeZone(inicio, TZ, 'MMMM yyyy')

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient">Calendario</h1>
          <span className="chip">{eventos.length} eventos</span>
        </div>
        <p className="text-sm text-zinc-400">Todos los pagos, eventos, vencimientos y tareas del mes.</p>
      </header>

      {/* Navegación de mes */}
      <div className="flex items-center justify-between card p-3">
        <Link
          href={`/calendario?ym=${fmtYM(prevMes.año, prevMes.mes)}`}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-cyan-400"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <p className="text-base font-bold text-white capitalize">{tituloMes}</p>
        <Link
          href={`/calendario?ym=${fmtYM(nextMes.año, nextMes.mes)}`}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-cyan-400"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>

      {/* Totales del mes */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card p-3">
          <p className="text-[10px] text-zinc-500">📅 Gastos fijos</p>
          <p className="text-sm font-bold tabular-nums text-blue-400">{formatMoney(totales.gasto_fijo.mxn, 'MXN')}</p>
          <p className="text-[10px] text-zinc-500">{totales.gasto_fijo.count} pagos</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-zinc-500">💸 Por pagar</p>
          <p className="text-sm font-bold tabular-nums text-rose-400">{formatMoney(totales.cuenta_por_pagar.mxn, 'MXN')}</p>
          <p className="text-[10px] text-zinc-500">{totales.cuenta_por_pagar.count} deudas</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-zinc-500">🎉 Eventos</p>
          <p className="text-sm font-bold tabular-nums text-pink-400">{formatMoney(totales.evento.mxn, 'MXN')}</p>
          <p className="text-[10px] text-zinc-500">{totales.evento.count} bookings</p>
        </div>
      </div>

      {/* Grid del mes */}
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
            const evs = porDia.get(c.fecha!) ?? []
            const esHoy = c.fecha === hoy
            return (
              <div
                key={i}
                className={cn(
                  'aspect-square p-1 rounded-md flex flex-col items-stretch text-[10px] border',
                  esHoy
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : evs.length > 0
                      ? 'border-[var(--border-subtle)] bg-[var(--bg-input)]'
                      : 'border-transparent'
                )}
              >
                <span className={cn('text-center font-bold', esHoy ? 'text-cyan-300' : 'text-zinc-400')}>
                  {c.dia}
                </span>
                {evs.length > 0 && (
                  <div className="flex-1 flex flex-wrap gap-0.5 items-center justify-center mt-1">
                    {evs.slice(0, 4).map((e, idx) => (
                      <span key={idx} className="text-[10px]">{e.emoji}</span>
                    ))}
                    {evs.length > 4 && <span className="text-[8px] text-zinc-500">+{evs.length - 4}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Lista de eventos del mes */}
      <section className="space-y-2">
        <h2 className="label-caps">Detalle del mes</h2>
        {eventos.length === 0 ? (
          <EmptyState
            emoji="🗓️"
            title="Sin eventos en este mes"
            description="Cuando programes pagos fijos, tareas con vencimiento, eventos o cuentas por pagar aparecerán aquí."
          />
        ) : (
          <ul className="space-y-2">
            {Array.from(porDia.entries()).map(([fecha, evs]) => (
              <li key={fecha}>
                <div className="space-y-1.5">
                  <p className={cn(
                    'text-xs font-bold uppercase tracking-wider px-1',
                    fecha === hoy ? 'text-cyan-400' : 'text-zinc-400'
                  )}>
                    {formatearFecha(fecha, 'EEEE dd MMM')}{fecha === hoy ? ' · HOY' : ''}
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
                          {e.monto && (
                            <p className={cn('text-sm font-bold tabular-nums', e.color)}>
                              {formatMoney(e.monto, e.moneda || 'MXN')}
                            </p>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
