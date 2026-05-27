import Link from 'next/link'
import { ChevronLeft, ChevronRight, List, Plus, Calendar as CalIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha, hoyEnCabos, TZ } from '@/lib/fechas'
import { formatInTimeZone } from 'date-fns-tz'
import { EmptyState } from '@/components/ui/empty-state'

type SearchParams = { ym?: string; estado?: string }

const ESTADOS_VALIDOS = ['reservado', 'confirmado', 'realizado', 'pagado_proveedor', 'cancelado'] as const

const ESTADO_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  reservado:        { dot: 'bg-amber-400',   bg: 'bg-amber-500/15  border-amber-500/40',   text: 'text-amber-300' },
  confirmado:       { dot: 'bg-cyan-400',    bg: 'bg-cyan-500/15   border-cyan-500/40',    text: 'text-cyan-300' },
  realizado:        { dot: 'bg-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/40', text: 'text-emerald-300' },
  pagado_proveedor: { dot: 'bg-emerald-600', bg: 'bg-emerald-600/15 border-emerald-600/40', text: 'text-emerald-200' },
  cancelado:        { dot: 'bg-zinc-600',    bg: 'bg-zinc-700/15   border-zinc-700/40',    text: 'text-zinc-500' },
}

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

export default async function CalendarioEventosPage(
  { searchParams }: { searchParams: Promise<SearchParams> }
) {
  const sp = await searchParams
  const { año, mes } = parseYM(sp.ym)
  const filtroEstado = sp.estado && (ESTADOS_VALIDOS as readonly string[]).includes(sp.estado) ? sp.estado : null

  const inicio = new Date(año, mes, 1)
  const fin = new Date(año, mes + 1, 0)
  const inicioStr = `${año}-${String(mes + 1).padStart(2, '0')}-01`
  const finStr = `${año}-${String(mes + 1).padStart(2, '0')}-${String(fin.getDate()).padStart(2, '0')}`

  const supabase = await createClient()
  let query = supabase
    .from('eventos')
    .select('id, cliente_nombre, fecha_evento, hora_evento, tipo_evento, monto_total, moneda, estado, proveedor_nombre, num_personas, duracion_horas, paquete')
    .gte('fecha_evento', inicioStr)
    .lte('fecha_evento', finStr)
    .order('fecha_evento', { ascending: true })
    .order('hora_evento', { ascending: true })

  if (filtroEstado) query = query.eq('estado', filtroEstado)

  const { data: eventos } = await query

  const hoy = hoyEnCabos()
  const lista = eventos ?? []

  // Agrupar por día
  type Evento = typeof lista[number]
  const porDia = new Map<string, Evento[]>()
  for (const e of lista) {
    const arr = porDia.get(e.fecha_evento) ?? []
    arr.push(e)
    porDia.set(e.fecha_evento, arr)
  }

  const diasMes = fin.getDate()
  const primerDiaSemana = inicio.getDay()

  const celdas: { dia: number | null; fecha: string | null }[] = []
  for (let i = 0; i < primerDiaSemana; i++) celdas.push({ dia: null, fecha: null })
  for (let d = 1; d <= diasMes; d++) {
    const fecha = `${año}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    celdas.push({ dia: d, fecha })
  }

  // Totales del mes
  const cancelados = lista.filter((e) => e.estado === 'cancelado').length
  const activos = lista.length - cancelados
  const totalPersonas = lista
    .filter((e) => e.estado !== 'cancelado')
    .reduce((sum, e) => sum + (e.num_personas ?? 0), 0)
  const ingresoEstimadoMxn = lista
    .filter((e) => e.estado !== 'cancelado' && e.moneda === 'MXN')
    .reduce((sum, e) => sum + Number(e.monto_total), 0)
  const ingresoEstimadoUsd = lista
    .filter((e) => e.estado !== 'cancelado' && e.moneda === 'USD')
    .reduce((sum, e) => sum + Number(e.monto_total), 0)

  const prevMes = mes === 0 ? { año: año - 1, mes: 11 } : { año, mes: mes - 1 }
  const nextMes = mes === 11 ? { año: año + 1, mes: 0 } : { año, mes: mes + 1 }
  const tituloMes = formatInTimeZone(inicio, TZ, 'MMMM yyyy')

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient">🎉 Calendario Rancho</h1>
          <span className="chip chip-purple">{activos} eventos</span>
        </div>
        <p className="text-sm text-zinc-400">Vista mensual · toca un día para agregar evento · toca un evento para detalle.</p>

        {/* Tabs Lista / Calendario */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[var(--bg-input)] border border-[var(--border-subtle)]">
          <Link
            href="/eventos"
            className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold text-zinc-400 hover:text-white"
          >
            <List className="h-3.5 w-3.5" /> Lista
          </Link>
          <span className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow">
            <CalIcon className="h-3.5 w-3.5" /> Calendario
          </span>
        </div>
      </header>

      {/* Navegación de mes */}
      <div className="flex items-center justify-between card p-3">
        <Link
          href={`/eventos/calendario?ym=${fmtYM(prevMes.año, prevMes.mes)}`}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-cyan-400"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <p className="text-base font-bold text-white capitalize">{tituloMes}</p>
        <Link
          href={`/eventos/calendario?ym=${fmtYM(nextMes.año, nextMes.mes)}`}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-zinc-400 hover:text-cyan-400"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        <div className="card p-3">
          <p className="text-[10px] text-zinc-500">Eventos</p>
          <p className="text-lg font-bold text-white tabular-nums">{activos}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-zinc-500">Personas</p>
          <p className="text-lg font-bold text-purple-300 tabular-nums">{totalPersonas}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-zinc-500">Ingreso MXN</p>
          <p className="text-sm font-bold text-emerald-400 tabular-nums">{formatMoney(ingresoEstimadoMxn, 'MXN')}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-zinc-500">Cancelados</p>
          <p className="text-lg font-bold text-zinc-400 tabular-nums">{cancelados}</p>
        </div>
      </div>

      {ingresoEstimadoUsd > 0 && (
        <p className="text-[11px] text-zinc-500 text-center">+ {formatMoney(ingresoEstimadoUsd, 'USD')} en USD</p>
      )}

      {/* Filtro por estado (clickeable, conserva ym) */}
      <div className="flex flex-wrap gap-1.5">
        <Link
          href={`/eventos/calendario?ym=${fmtYM(año, mes)}`}
          className={cn(
            'h-7 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors',
            !filtroEstado ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300' : 'border-[var(--border-subtle)] text-zinc-500 hover:text-white'
          )}
        >
          Todos
        </Link>
        {Object.entries(ESTADO_COLORS).map(([estado, c]) => {
          const active = filtroEstado === estado
          return (
            <Link
              key={estado}
              href={`/eventos/calendario?ym=${fmtYM(año, mes)}&estado=${estado}`}
              className={cn(
                'h-7 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider border inline-flex items-center gap-1.5 transition-colors',
                active ? `${c.bg} ${c.text}` : 'border-[var(--border-subtle)] text-zinc-500 hover:text-white'
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', c.dot)} />
              <span>{estado.replace(/_/g, ' ')}</span>
            </Link>
          )
        })}
      </div>

      {/* Grid del mes */}
      <div className="card p-2">
        <div className="grid grid-cols-7 gap-1 text-center">
          {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
            <div key={i} className="text-[10px] font-bold text-zinc-500 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {celdas.map((c, i) => {
            if (!c.dia) return <div key={i} className="aspect-square" />
            const evs = porDia.get(c.fecha!) ?? []
            const esHoy = c.fecha === hoy

            // Si no tiene eventos, el día es clickeable para crear
            if (evs.length === 0) {
              return (
                <Link
                  key={i}
                  href={`/eventos/nuevo?fecha=${c.fecha}`}
                  className={cn(
                    'aspect-square p-1 rounded-md flex flex-col items-center justify-start text-[10px] border transition-colors group',
                    esHoy
                      ? 'border-cyan-500 bg-cyan-500/10'
                      : 'border-transparent hover:border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)]'
                  )}
                >
                  <span className={cn('font-bold', esHoy ? 'text-cyan-300' : 'text-zinc-600')}>
                    {c.dia}
                  </span>
                  <Plus className="h-3 w-3 mt-1 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              )
            }

            // Con eventos: muestra dots
            return (
              <div
                key={i}
                className={cn(
                  'aspect-square p-1 rounded-md flex flex-col items-stretch text-[10px] border',
                  esHoy
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-[var(--border-subtle)] bg-[var(--bg-input)]'
                )}
              >
                <span className={cn('text-center font-bold', esHoy ? 'text-cyan-300' : 'text-zinc-300')}>
                  {c.dia}
                </span>
                <div className="flex-1 flex flex-wrap gap-0.5 items-center justify-center mt-0.5">
                  {evs.slice(0, 3).map((e) => {
                    const c2 = ESTADO_COLORS[e.estado] ?? ESTADO_COLORS.reservado
                    return <span key={e.id} className={cn('h-1.5 w-1.5 rounded-full', c2.dot)} />
                  })}
                  {evs.length > 3 && (
                    <span className="text-[8px] text-zinc-500">+{evs.length - 3}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Lista detallada del mes */}
      <section className="space-y-2">
        <h2 className="label-caps">Detalle del mes</h2>
        {lista.length === 0 ? (
          <EmptyState
            emoji="🎉"
            title={`Sin eventos en ${tituloMes}`}
            description="Toca cualquier día del calendario para agregar uno."
            cta={{ label: 'Nuevo evento', href: '/eventos/nuevo' }}
          />
        ) : (
          <ul className="space-y-2">
            {Array.from(porDia.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([fecha, evs]) => (
                <li key={fecha}>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-1">
                      <p className={cn(
                        'text-xs font-bold uppercase tracking-wider',
                        fecha === hoy ? 'text-cyan-400' : 'text-zinc-400'
                      )}>
                        {formatearFecha(fecha, 'EEEE dd MMM')}{fecha === hoy ? ' · HOY' : ''}
                      </p>
                      <Link
                        href={`/eventos/nuevo?fecha=${fecha}`}
                        className="text-[10px] text-cyan-400 inline-flex items-center gap-0.5"
                      >
                        <Plus className="h-3 w-3" /> agregar
                      </Link>
                    </div>
                    <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
                      {evs.map((e) => {
                        const colors = ESTADO_COLORS[e.estado] ?? ESTADO_COLORS.reservado
                        return (
                          <li key={e.id}>
                            <Link href={`/eventos/${e.id}`} className="flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                              <span className={cn('h-2.5 w-2.5 rounded-full shrink-0 mt-1', colors.dot)} />
                              <div className="flex-1 min-w-0 leading-tight">
                                <p className="text-sm font-bold text-white truncate">
                                  {e.cliente_nombre}
                                  {e.hora_evento && <span className="text-zinc-500 font-normal"> · {e.hora_evento.slice(0, 5)}</span>}
                                </p>
                                <p className="text-[10px] text-zinc-500 truncate">
                                  {e.paquete || e.tipo_evento || '—'}
                                </p>
                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                  <span className={cn('chip text-[9px] h-4 px-1.5', colors.text)}>
                                    {e.estado.replace(/_/g, ' ')}
                                  </span>
                                  {e.num_personas != null && (
                                    <span className="text-[10px] text-zinc-400">👥 {e.num_personas}</span>
                                  )}
                                  {e.duracion_horas != null && (
                                    <span className="text-[10px] text-zinc-400">⏱ {e.duracion_horas}h</span>
                                  )}
                                </div>
                              </div>
                              <p className="text-sm font-bold tabular-nums text-white shrink-0">
                                {Number(e.monto_total) > 0 ? formatMoney(Number(e.monto_total), e.moneda as 'MXN' | 'USD') : <span className="text-zinc-500 text-[10px]">sin monto</span>}
                              </p>
                            </Link>
                          </li>
                        )
                      })}
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
