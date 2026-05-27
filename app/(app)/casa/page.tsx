import Link from 'next/link'
import { Home, ArrowDownCircle, User, Lightbulb, TrendingUp, AlertTriangle, Scale, PiggyBank } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha, hoyEnCabos } from '@/lib/fechas'
import { isRangoId, rangoFechas, type RangoId } from '@/lib/rangos'
import { CategoriasList } from '@/components/dashboard/categorias-list'
import { porCategoria } from '@/lib/agregaciones'
import { RangoSelector } from '@/components/dashboard/rango-selector'
import { LiquidarRoomatesForm } from '@/components/casa/liquidar-form'
import { EmptyState } from '@/components/ui/empty-state'

type SearchParams = {
  rango?: string
  desde?: string
  hasta?: string
  vista?: string
}

export default async function CasaPage(
  { searchParams }: { searchParams: Promise<SearchParams> }
) {
  const sp = await searchParams
  const rangoId: RangoId = isRangoId(sp.rango) ? sp.rango : 'mes_actual'
  const r = rangoFechas(rangoId, sp.desde, sp.hasta)
  const vista = sp.vista ?? 'todo'

  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: casa } = await admin
    .from('negocios')
    .select('id, nombre')
    .eq('tipo', 'casa')
    .single()

  if (!casa) {
    return (
      <div className="px-4 pt-5 pb-24 space-y-4 max-w-3xl mx-auto">
        <EmptyState
          emoji="🏠"
          title="No hay negocio Casa"
          description="Pega la migración 0009_casa.sql en Supabase para crearlo."
        />
      </div>
    )
  }

  const { data: socios } = await admin
    .from('profiles')
    .select('id, nombre, role_id, roles(nombre)')
    .eq('activo', true)

  const sociosFiltered = (socios ?? []).filter((p) => {
    const r = p.roles as unknown as { nombre: string } | null
    return r?.nombre === 'admin' || r?.nombre === 'socio'
  })

  // === FETCH transacciones ===
  type CasaTx = {
    id: string
    tipo: string
    monto: number
    moneda: string
    fecha: string
    categoria: string | null
    capturado_por: string | null
    monto_mxn_equivalente: number | null
    concepto: string | null
    atribuido_a?: string | null
  }
  const txsColsBase = 'id, tipo, monto, moneda, fecha, categoria, capturado_por, monto_mxn_equivalente, concepto'
  const ultColsBase = 'id, tipo, monto, moneda, fecha, concepto, categoria, capturado_por, monto_mxn_equivalente'

  // Periodo actual
  let txs: CasaTx[] = []
  {
    const r1 = await supabase.from('transacciones').select(`${txsColsBase}, atribuido_a`)
      .eq('negocio_id', casa.id).gte('fecha', r.desde).lte('fecha', r.hasta)
    if (r1.error && /atribuido_a/.test(r1.error.message ?? '')) {
      const r2 = await supabase.from('transacciones').select(txsColsBase)
        .eq('negocio_id', casa.id).gte('fecha', r.desde).lte('fecha', r.hasta)
      txs = (r2.data ?? []) as unknown as CasaTx[]
    } else {
      txs = (r1.data ?? []) as unknown as CasaTx[]
    }
  }

  // Periodo anterior (mismo número de días)
  const desdeDate = new Date(r.desde + 'T00:00:00')
  const hastaDate = new Date(r.hasta + 'T00:00:00')
  const duracionMs = hastaDate.getTime() - desdeDate.getTime()
  const previoHasta = new Date(desdeDate.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const previoDesde = new Date(desdeDate.getTime() - 24 * 60 * 60 * 1000 - duracionMs).toISOString().slice(0, 10)
  let txsPrev: CasaTx[] = []
  {
    const r1 = await supabase.from('transacciones').select(`${txsColsBase}, atribuido_a`)
      .eq('negocio_id', casa.id).gte('fecha', previoDesde).lte('fecha', previoHasta)
    if (r1.error && /atribuido_a/.test(r1.error.message ?? '')) {
      const r2 = await supabase.from('transacciones').select(txsColsBase)
        .eq('negocio_id', casa.id).gte('fecha', previoDesde).lte('fecha', previoHasta)
      txsPrev = (r2.data ?? []) as unknown as CasaTx[]
    } else {
      txsPrev = (r1.data ?? []) as unknown as CasaTx[]
    }
  }

  let ultimasCasa: CasaTx[] = []
  {
    const r1 = await supabase.from('transacciones').select(`${ultColsBase}, atribuido_a`)
      .eq('negocio_id', casa.id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(15)
    if (r1.error && /atribuido_a/.test(r1.error.message ?? '')) {
      const r2 = await supabase.from('transacciones').select(ultColsBase)
        .eq('negocio_id', casa.id)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(15)
      ultimasCasa = (r2.data ?? []) as unknown as CasaTx[]
    } else {
      ultimasCasa = (r1.data ?? []) as unknown as CasaTx[]
    }
  }

  const en7 = new Date(new Date(hoyEnCabos() + 'T00:00:00').getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [{ data: proxGfCasa }, { data: cuentas }] = await Promise.all([
    admin.from('gastos_recurrentes').select('id, nombre, monto, moneda, proximo_pago')
      .eq('negocio_id', casa.id).eq('activo', true)
      .gte('proximo_pago', hoyEnCabos()).lte('proximo_pago', en7)
      .order('proximo_pago', { ascending: true }),
    admin.from('cuentas').select('id, nombre, moneda').eq('activo', true).order('nombre'),
  ])

  const rows = txs

  // === MODELO CORRECTO ===
  // Compartido = gasto operativo de la sociedad (no afecta a socios individualmente)
  // Personal de X = AVANCE que la empresa le dio a X (se deducirá de su utilidad al corte)
  function bucketize(rows: CasaTx[]) {
    let compartido = 0
    const avancePor = new Map<string, number>() // avance personal de cada socio
    for (const s of sociosFiltered) avancePor.set(s.id, 0)
    for (const t of rows) {
      const equiv = t.monto_mxn_equivalente != null ? Number(t.monto_mxn_equivalente) : (t.moneda === 'MXN' ? Number(t.monto) : 0)
      if (t.tipo === 'gasto' || t.tipo === 'multa_interna') {
        if (t.atribuido_a) {
          avancePor.set(t.atribuido_a, (avancePor.get(t.atribuido_a) ?? 0) + equiv)
        } else {
          compartido += equiv
        }
      } else if (t.tipo === 'liquidacion_socio' && t.capturado_por) {
        // Liquidación: el que paga REDUCE su avance pendiente
        avancePor.set(t.capturado_por, (avancePor.get(t.capturado_por) ?? 0) - equiv)
      }
    }
    const totalAvances = Array.from(avancePor.values()).reduce((a, b) => a + b, 0)
    const total = compartido + totalAvances
    return { compartido, avancePor, totalAvances, total }
  }

  const actual = bucketize(rows)
  const prev = bucketize(txsPrev)

  // Reporte por socio
  const reportes = sociosFiltered.map((s) => {
    const avance = actual.avancePor.get(s.id) ?? 0
    const avancePrev = prev.avancePor.get(s.id) ?? 0
    const deltaPct = avancePrev > 0 ? Math.round(((avance - avancePrev) / avancePrev) * 100) : null
    return { id: s.id, nombre: s.nombre, avance, avancePrev, deltaPct }
  })

  // Diferencia de avances entre socios
  const sortedByAvance = [...reportes].sort((a, b) => b.avance - a.avance)
  const adelantoMas = sortedByAvance[0]
  const adelantoMenos = sortedByAvance[sortedByAvance.length - 1]
  const diferenciaAvances = adelantoMas && adelantoMenos ? adelantoMas.avance - adelantoMenos.avance : 0
  const necesitaEquilibrar = diferenciaAvances > 100 && sociosFiltered.length === 2

  // === RECOMENDACIONES ===
  type Reco = { tipo: 'info' | 'warning' | 'success'; texto: string }
  const recos: Reco[] = []

  // Diferencia entre avances
  if (necesitaEquilibrar && adelantoMas && adelantoMenos) {
    recos.push({
      tipo: 'warning',
      texto: `${adelantoMas.nombre} adelantó ${formatMoney(diferenciaAvances, 'MXN')} más que ${adelantoMenos.nombre}. Si quieren equilibrar antes del corte, ${adelantoMas.nombre} debe transferir ${formatMoney(diferenciaAvances / 2, 'MXN')} a ${adelantoMenos.nombre}.`,
    })
  }

  // Avances comparados con periodo anterior
  for (const rep of reportes) {
    if (rep.deltaPct !== null && Math.abs(rep.deltaPct) >= 40 && rep.avance >= 500) {
      recos.push({
        tipo: rep.deltaPct > 0 ? 'warning' : 'success',
        texto: `Avances personales de ${rep.nombre}: ${rep.deltaPct > 0 ? '+' : ''}${rep.deltaPct}% vs período anterior (${formatMoney(rep.avance, 'MXN')} vs ${formatMoney(rep.avancePrev, 'MXN')}).`,
      })
    }
  }

  // Compartido creció/bajó
  if (prev.compartido > 1000 && Math.abs(actual.compartido - prev.compartido) / prev.compartido > 0.2) {
    const pct = Math.round(((actual.compartido - prev.compartido) / prev.compartido) * 100)
    recos.push({
      tipo: pct > 0 ? 'warning' : 'success',
      texto: pct > 0
        ? `Gastos compartidos de casa subieron ${pct}% (${formatMoney(actual.compartido, 'MXN')} vs ${formatMoney(prev.compartido, 'MXN')}). Revisa qué creció.`
        : `Gastos compartidos bajaron ${Math.abs(pct)}%. ¡Bien!`,
    })
  }

  // Top categoría
  const topCatsAll = porCategoria(rows.map((t) => ({ ...t, negocio_id: casa.id })))
  if (topCatsAll.length > 0 && actual.total > 0) {
    const top = topCatsAll[0]
    const pct = Math.round((top.monto / actual.total) * 100)
    if (pct >= 30) {
      recos.push({
        tipo: 'info',
        texto: `"${top.categoria}" representa el ${pct}% del gasto de Casa (${formatMoney(top.monto, 'MXN')}). Es la categoría más alta.`,
      })
    }
  }

  // Próximos gastos fijos
  if (proxGfCasa && proxGfCasa.length > 0) {
    const sumProx = proxGfCasa.reduce((s, g) => s + Number(g.monto), 0)
    recos.push({
      tipo: 'info',
      texto: `${proxGfCasa.length} pago${proxGfCasa.length > 1 ? 's' : ''} fijo${proxGfCasa.length > 1 ? 's' : ''} en próximos 7 días suman ${formatMoney(sumProx, 'MXN')}.`,
    })
  }

  // Reco: si un socio acumuló mucho avance personal
  for (const rep of reportes) {
    if (rep.avance >= 10000) {
      recos.push({
        tipo: 'warning',
        texto: `${rep.nombre} acumula ${formatMoney(rep.avance, 'MXN')} en avances personales este período. Asegúrate de tener utilidad suficiente para cubrirlo al corte.`,
      })
    }
  }

  // Vista filter
  const rowsFiltered = ultimasCasa.filter((t) => {
    if (vista === 'todo') return true
    if (vista === 'compartido') return !t.atribuido_a
    return t.atribuido_a === vista
  })

  const topCats = porCategoria(
    rows.filter((t) => {
      if (vista === 'todo') return true
      if (vista === 'compartido') return !t.atribuido_a
      return t.atribuido_a === vista
    }).map((t) => ({ ...t, negocio_id: casa.id }))
  )

  return (
    <div className="px-3 sm:px-4 pt-4 pb-24 space-y-4 max-w-3xl mx-auto">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl sm:text-2xl font-black heading-gradient inline-flex items-center gap-2">
            <Home className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-400" />
            Casa
          </h1>
          <span className="chip chip-cyan text-[10px]">{rows.length} mov</span>
        </div>
        <p className="text-xs sm:text-sm text-zinc-400">
          La empresa cubre todo. Compartidos son operativos. Personales son adelantos que se deducen al corte.
        </p>
        <RangoSelector actual={rangoId} customDesde={sp.desde} customHasta={sp.hasta} />
      </header>

      {/* HERO: Total */}
      <section className="card-glow p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="label-caps text-[9px]">Total casa salido de la empresa · {r.label}</span>
          <ArrowDownCircle className="h-3.5 w-3.5 text-rose-400/60" />
        </div>
        <p className="text-3xl sm:text-4xl font-black tabular-nums text-rose-300">
          {formatMoney(actual.total, 'MXN')}
        </p>
      </section>

      {/* AVANCES PERSONALES — sección destacada */}
      <section className="space-y-2">
        <h2 className="label-caps inline-flex items-center gap-1.5 text-purple-300">
          <PiggyBank className="h-3 w-3" />
          Avances personales (se deducen de utilidad al corte)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {reportes.map((b) => {
            return (
              <div key={b.id} className="card-glow border-purple-500/30 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-purple-300" />
                    <p className="text-sm font-bold text-white">{b.nombre}</p>
                  </div>
                  {b.deltaPct !== null && (
                    <span className={cn(
                      'text-[9px] font-bold tabular-nums px-1.5 py-0.5 rounded',
                      b.deltaPct > 0 ? 'bg-rose-500/15 text-rose-300' : 'bg-emerald-500/15 text-emerald-300'
                    )}>
                      {b.deltaPct > 0 ? '+' : ''}{b.deltaPct}%
                    </span>
                  )}
                </div>
                <p className="text-2xl font-black tabular-nums text-purple-200">
                  {formatMoney(b.avance, 'MXN')}
                </p>
                {b.avancePrev > 0 && (
                  <p className="text-[10px] text-zinc-500">
                    período anterior: {formatMoney(b.avancePrev, 'MXN')}
                  </p>
                )}
                <p className="text-[10px] text-purple-300/60">
                  Se restará de su utilidad al cierre
                </p>
              </div>
            )
          })}
        </div>

        {/* Diferencia entre avances */}
        {necesitaEquilibrar && adelantoMas && adelantoMenos && (
          <div className="card border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <Scale className="h-3.5 w-3.5 text-amber-300" />
              <p className="text-xs font-bold text-amber-300">Diferencia entre socios</p>
            </div>
            <p className="text-xs text-amber-200">
              <strong>{adelantoMas.nombre}</strong> adelantó <strong className="tabular-nums">{formatMoney(diferenciaAvances, 'MXN')}</strong> más que <strong>{adelantoMenos.nombre}</strong>.
            </p>
            <p className="text-[11px] text-amber-200/80">
              Si quieren empatar antes del corte, <strong>{adelantoMas.nombre}</strong> puede transferirle <strong className="tabular-nums">{formatMoney(diferenciaAvances / 2, 'MXN')}</strong> a <strong>{adelantoMenos.nombre}</strong>.
            </p>
            <LiquidarRoomatesForm
              socios={reportes.map((b) => ({ id: b.id, nombre: b.nombre }))}
              cuentas={cuentas ?? []}
              sugeridoMonto={diferenciaAvances / 2}
              sugeridoPagador={adelantoMas.id}
              sugeridoReceptor={adelantoMenos.id}
            />
          </div>
        )}
      </section>

      {/* GASTO COMPARTIDO */}
      <section className="card border-cyan-500/30 bg-cyan-500/5 p-3 space-y-1">
        <div className="flex items-center justify-between">
          <p className="label-caps text-cyan-300 inline-flex items-center gap-1.5">
            ⚖ Gasto compartido (operativo)
          </p>
          <span className="text-[10px] text-zinc-500">no se deduce a nadie</span>
        </div>
        <p className="text-xl font-black tabular-nums text-cyan-200">
          {formatMoney(actual.compartido, 'MXN')}
        </p>
        <p className="text-[10px] text-zinc-400">
          Renta, luz, internet, despensa compartida — la sociedad lo absorbe como gasto operativo.
        </p>
      </section>

      {/* Recomendaciones */}
      {recos.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps inline-flex items-center gap-1.5">
            <Lightbulb className="h-3 w-3 text-amber-400" />
            Recomendaciones ({recos.length})
          </h2>
          <ul className="space-y-1.5">
            {recos.map((reco, i) => {
              const Icon = reco.tipo === 'warning' ? AlertTriangle : reco.tipo === 'success' ? TrendingUp : Lightbulb
              const color =
                reco.tipo === 'warning' ? 'border-amber-500/40 bg-amber-500/5 text-amber-200'
                : reco.tipo === 'success' ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-200'
                : 'border-cyan-500/30 bg-cyan-500/5 text-cyan-200'
              const iconColor =
                reco.tipo === 'warning' ? 'text-amber-400'
                : reco.tipo === 'success' ? 'text-emerald-400'
                : 'text-cyan-400'
              return (
                <li key={i} className={cn('rounded-xl border p-2.5 flex items-start gap-2', color)}>
                  <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', iconColor)} />
                  <p className="text-xs leading-snug">{reco.texto}</p>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Próximos gastos fijos */}
      {proxGfCasa && proxGfCasa.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps">📅 Próximos 7 días</h2>
          <ul className="space-y-1.5">
            {proxGfCasa.map((g) => (
              <li key={g.id}>
                <Link href={`/recurrentes/${g.id}`} className="card flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <span className="text-base">📅</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{g.nombre}</p>
                    <p className="text-[10px] text-zinc-500">{formatearFecha(g.proximo_pago, 'EEEE dd MMM')}</p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-blue-400">
                    {formatMoney(Number(g.monto), g.moneda as 'MXN' | 'USD')}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tabs vista */}
      <div className="flex flex-wrap gap-1">
        {[
          { key: 'todo', label: 'Todos' },
          { key: 'compartido', label: '⚖ Compartido' },
          ...sociosFiltered.map((s) => ({ key: s.id, label: `👤 ${s.nombre}` })),
        ].map((opt) => {
          const active = vista === opt.key
          const qs = new URLSearchParams({ rango: rangoId })
          if (sp.desde) qs.set('desde', sp.desde)
          if (sp.hasta) qs.set('hasta', sp.hasta)
          if (opt.key !== 'todo') qs.set('vista', opt.key)
          return (
            <Link
              key={opt.key}
              href={`/casa?${qs.toString()}`}
              className={cn(
                'h-7 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors whitespace-nowrap',
                active ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300' : 'border-[var(--border-subtle)] text-zinc-500 hover:text-white'
              )}
            >
              {opt.label}
            </Link>
          )
        })}
      </div>

      {/* Categorías */}
      {topCats.length > 0 && (
        <CategoriasList data={topCats} />
      )}

      {/* Últimas tx */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="label-caps">
            {vista === 'todo' ? 'Últimas' :
             vista === 'compartido' ? 'Últimas compartidas' :
             `Últimas de ${sociosFiltered.find((s) => s.id === vista)?.nombre ?? '—'}`}
          </h2>
          <Link href={`/transacciones?negocio=${casa.id}`} className="text-xs text-cyan-400 font-semibold">Ver todas →</Link>
        </div>
        {rowsFiltered.length > 0 ? (
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {rowsFiltered.map((u) => {
              const isGasto = u.tipo === 'gasto' || u.tipo === 'multa_interna'
              const atribuidoSocio = u.atribuido_a ? sociosFiltered.find((s) => s.id === u.atribuido_a) : null
              return (
                <li key={u.id}>
                  <Link href={`/transacciones/${u.id}`} className="flex items-center gap-3 p-3 hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-sm font-semibold truncate text-zinc-100">{u.concepto || u.categoria || 'Sin concepto'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-zinc-500">{formatearFecha(u.fecha, 'dd MMM')}</span>
                        {atribuidoSocio ? (
                          <span className="chip text-[9px] h-4 px-1.5 chip-purple">Avance {atribuidoSocio.nombre}</span>
                        ) : (
                          <span className="chip text-[9px] h-4 px-1.5 chip-cyan">⚖ Compartido</span>
                        )}
                      </div>
                    </div>
                    <p className={cn('text-sm font-bold tabular-nums', isGasto ? 'text-rose-400' : 'text-emerald-400')}>
                      {isGasto ? '−' : '+'}{formatMoney(Number(u.monto), u.moneda as 'MXN' | 'USD')}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState
            emoji="🏠"
            title={vista === 'todo' ? 'Sin movimientos en Casa' : 'Sin movimientos en esta vista'}
            description="Captura un gasto con negocio Casa para verlo aquí."
            cta={{ label: 'Nueva transacción', href: '/transacciones/nueva' }}
          />
        )}
      </section>
    </div>
  )
}
