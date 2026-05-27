import Link from 'next/link'
import { Home, ArrowDownCircle, Scale, User, Lightbulb, TrendingUp, AlertTriangle } from 'lucide-react'
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

  // Periodo anterior (para insights de cambio %)
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

  // Últimas tx Casa
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

  // Próximos gastos fijos Casa
  const en7 = new Date(new Date(hoyEnCabos() + 'T00:00:00').getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [{ data: proxGfCasa }, { data: cuentas }] = await Promise.all([
    admin.from('gastos_recurrentes').select('id, nombre, monto, moneda, proximo_pago')
      .eq('negocio_id', casa.id).eq('activo', true)
      .gte('proximo_pago', hoyEnCabos()).lte('proximo_pago', en7)
      .order('proximo_pago', { ascending: true }),
    admin.from('cuentas').select('id, nombre, moneda').eq('activo', true).order('nombre'),
  ])

  const rows = txs
  const N = Math.max(1, sociosFiltered.length)

  // === BUCKETS ===
  function bucketize(rows: CasaTx[]) {
    let compartido = 0
    const personalPor = new Map<string, number>()
    const pagadoPor = new Map<string, number>()
    for (const s of sociosFiltered) {
      personalPor.set(s.id, 0)
      pagadoPor.set(s.id, 0)
    }
    for (const t of rows) {
      const equiv = t.monto_mxn_equivalente != null ? Number(t.monto_mxn_equivalente) : (t.moneda === 'MXN' ? Number(t.monto) : 0)
      if (t.tipo === 'gasto' || t.tipo === 'multa_interna') {
        if (t.atribuido_a) {
          personalPor.set(t.atribuido_a, (personalPor.get(t.atribuido_a) ?? 0) + equiv)
        } else {
          compartido += equiv
        }
        if (t.capturado_por) pagadoPor.set(t.capturado_por, (pagadoPor.get(t.capturado_por) ?? 0) + equiv)
      } else if (t.tipo === 'liquidacion_socio' && t.capturado_por) {
        pagadoPor.set(t.capturado_por, (pagadoPor.get(t.capturado_por) ?? 0) - equiv)
      }
    }
    const cuota = compartido / N
    const total = compartido + Array.from(personalPor.values()).reduce((a, b) => a + b, 0)
    return { compartido, personalPor, pagadoPor, cuota, total }
  }

  const actual = bucketize(rows)
  const prev = bucketize(txsPrev)

  // Por socio: reporte completo
  const reportes = sociosFiltered.map((s) => {
    const personal = actual.personalPor.get(s.id) ?? 0
    const pagoFisico = actual.pagadoPor.get(s.id) ?? 0
    const leToca = actual.cuota + personal
    const diferencia = pagoFisico - leToca
    const personalPrev = prev.personalPor.get(s.id) ?? 0
    const deltaPct = personalPrev > 0 ? Math.round(((personal - personalPrev) / personalPrev) * 100) : null
    return { id: s.id, nombre: s.nombre, personal, cuotaCompartida: actual.cuota, leToca, pagoFisico, diferencia, deltaPct }
  })

  const deudores = reportes.filter((b) => b.diferencia < -0.01)
  const acreedores = reportes.filter((b) => b.diferencia > 0.01)

  // === RECOMENDACIONES IA (basadas en data, sin LLM) ===
  type Reco = { tipo: 'info' | 'warning' | 'success'; texto: string }
  const recos: Reco[] = []

  // Reco 1: alguien debe pagar para empatar
  if (deudores.length > 0 && acreedores.length > 0) {
    const d = deudores[0]
    const a = acreedores[0]
    const tr = Math.min(Math.abs(d.diferencia), a.diferencia)
    recos.push({
      tipo: 'warning',
      texto: `${d.nombre} debe transferir ${formatMoney(tr, 'MXN')} a ${a.nombre} para empatar.`,
    })
  }

  // Reco 2: total cambio vs período anterior
  if (prev.total > 0) {
    const cambio = actual.total - prev.total
    const pct = Math.round((cambio / prev.total) * 100)
    if (Math.abs(pct) >= 15) {
      recos.push({
        tipo: cambio > 0 ? 'warning' : 'success',
        texto: cambio > 0
          ? `Gastos de Casa subieron ${pct}% vs período anterior (${formatMoney(actual.total, 'MXN')} vs ${formatMoney(prev.total, 'MXN')}). Revisa qué categorías crecieron.`
          : `Gastos de Casa bajaron ${Math.abs(pct)}% vs período anterior. Bien hecho.`,
      })
    }
  }

  // Reco 3: top categoría de gasto
  const topCatsAll = porCategoria(rows.map((t) => ({ ...t, negocio_id: casa.id })))
  if (topCatsAll.length > 0 && actual.total > 0) {
    const top = topCatsAll[0]
    const pct = Math.round((top.monto / actual.total) * 100)
    if (pct >= 30) {
      recos.push({
        tipo: 'info',
        texto: `"${top.categoria}" representa el ${pct}% del gasto de Casa (${formatMoney(top.monto, 'MXN')}). Considera optimizar esta categoría.`,
      })
    }
  }

  // Reco 4: gastos personales fuera de balance
  const maxPersonal = Math.max(...reportes.map((r) => r.personal), 0)
  if (maxPersonal > 0 && reportes.length === 2) {
    const top = reportes.find((r) => r.personal === maxPersonal)
    const otro = reportes.find((r) => r.id !== top?.id)
    if (top && otro && top.personal > otro.personal * 2 && top.personal > 1000) {
      recos.push({
        tipo: 'info',
        texto: `${top.nombre} tiene ${formatMoney(top.personal, 'MXN')} en gastos personales este período (>2x que ${otro.nombre}). Asegúrate de reembolsarlos a la sociedad.`,
      })
    }
  }

  // Reco 5: % aumento por socio personal
  for (const rep of reportes) {
    if (rep.deltaPct !== null && Math.abs(rep.deltaPct) >= 40 && rep.personal >= 500) {
      recos.push({
        tipo: rep.deltaPct > 0 ? 'warning' : 'success',
        texto: `Gastos personales de ${rep.nombre}: ${rep.deltaPct > 0 ? '+' : ''}${rep.deltaPct}% vs período anterior.`,
      })
    }
  }

  // Reco 6: próximos gastos fijos
  if (proxGfCasa && proxGfCasa.length > 0) {
    const sumProx = proxGfCasa.reduce((s, g) => s + Number(g.monto), 0)
    recos.push({
      tipo: 'info',
      texto: `${proxGfCasa.length} gasto${proxGfCasa.length > 1 ? 's' : ''} fijo${proxGfCasa.length > 1 ? 's' : ''} en próximos 7 días suman ${formatMoney(sumProx, 'MXN')}. Verifica fondos.`,
    })
  }

  // Filtrar transacciones por vista
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

  const totalReembolsoPersonal = Array.from(actual.personalPor.values()).reduce((a, b) => a + b, 0)

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
        <p className="text-xs sm:text-sm text-zinc-400">Gastos roomates · cuenta común cubre, aquí ves quién gasta qué.</p>
        <RangoSelector actual={rangoId} customDesde={sp.desde} customHasta={sp.hasta} />
      </header>

      {/* Hero compacto */}
      <section className="card-glow p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="label-caps text-[9px]">Total gastado · {r.label}</span>
          <ArrowDownCircle className="h-3.5 w-3.5 text-rose-400/60" />
        </div>
        <p className="text-3xl sm:text-4xl font-black tabular-nums text-rose-300">
          {formatMoney(actual.total, 'MXN')}
        </p>
        <div className="grid grid-cols-3 gap-2 pt-1 text-[10px]">
          <div>
            <p className="text-zinc-500">⚖ Compartido</p>
            <p className="text-sm font-bold text-cyan-300 tabular-nums">{formatMoney(actual.compartido, 'MXN')}</p>
          </div>
          <div>
            <p className="text-zinc-500">👤 Personales</p>
            <p className="text-sm font-bold text-purple-300 tabular-nums">{formatMoney(totalReembolsoPersonal, 'MXN')}</p>
          </div>
          <div>
            <p className="text-zinc-500">Cuota /persona</p>
            <p className="text-sm font-bold text-white tabular-nums">{formatMoney(actual.cuota, 'MXN')}</p>
          </div>
        </div>
      </section>

      {/* Recomendaciones IA */}
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

      {/* Tabs de vista */}
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

      {/* Balance por socio */}
      <section className="space-y-2">
        <h2 className="label-caps inline-flex items-center gap-1.5">
          <Scale className="h-3 w-3" /> Balance por socio
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {reportes.map((b) => {
            const teDeben = b.diferencia > 0.01
            const debes = b.diferencia < -0.01
            return (
              <div key={b.id} className={cn(
                'card p-3 space-y-1.5 border',
                teDeben ? 'border-emerald-500/30' : debes ? 'border-rose-500/30' : 'border-[var(--border-subtle)]'
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-cyan-400" />
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
                <p className="text-xl font-black tabular-nums text-white">
                  {formatMoney(b.leToca, 'MXN')}
                </p>
                <div className="space-y-0.5 text-[10px] text-zinc-500">
                  <div className="flex justify-between">
                    <span>Personal:</span>
                    <span className="text-purple-300 tabular-nums">{formatMoney(b.personal, 'MXN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>+ ½ compartido:</span>
                    <span className="text-cyan-300 tabular-nums">{formatMoney(b.cuotaCompartida, 'MXN')}</span>
                  </div>
                </div>
                {teDeben && (
                  <p className="text-[11px] text-emerald-400 tabular-nums font-bold">+{formatMoney(b.diferencia, 'MXN')} le deben</p>
                )}
                {debes && (
                  <p className="text-[11px] text-rose-400 tabular-nums font-bold">debe {formatMoney(Math.abs(b.diferencia), 'MXN')}</p>
                )}
                {!teDeben && !debes && (
                  <p className="text-[11px] text-zinc-500">empatado</p>
                )}
              </div>
            )
          })}
        </div>

        {deudores.length > 0 && acreedores.length > 0 && (
          <div className="card border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
            <p className="text-xs font-bold text-amber-300">⚖ Para empatar:</p>
            {deudores.map((d) => {
              const a = acreedores[0]
              if (!a) return null
              const transferir = Math.min(Math.abs(d.diferencia), a.diferencia)
              return (
                <p key={d.id} className="text-[11px] text-amber-200">
                  <strong>{d.nombre}</strong> debe pasarle <strong className="tabular-nums">{formatMoney(transferir, 'MXN')}</strong> a <strong>{a.nombre}</strong>
                </p>
              )
            })}
            <LiquidarRoomatesForm
              socios={reportes.map((b) => ({ id: b.id, nombre: b.nombre }))}
              cuentas={cuentas ?? []}
              sugeridoMonto={deudores[0] && Math.abs(deudores[0].diferencia)}
              sugeridoPagador={deudores[0]?.id}
              sugeridoReceptor={acreedores[0]?.id}
            />
          </div>
        )}
      </section>

      {/* Reembolsos pendientes */}
      {totalReembolsoPersonal > 0 && (
        <section className="card-glow border-purple-500/30 p-3 space-y-2">
          <p className="label-caps text-purple-300 inline-flex items-center gap-1.5">
            👥 Reembolso a sociedad
          </p>
          <p className="text-[10px] text-zinc-400">
            Gastos personales que la cuenta común cubrió. Cada socio debería reembolsar este monto.
          </p>
          <ul className="space-y-1 pt-0.5">
            {reportes.map((b) => b.personal > 0 ? (
              <li key={b.id} className="flex justify-between text-xs">
                <span className="text-zinc-300">👤 {b.nombre}</span>
                <span className="text-purple-300 font-bold tabular-nums">{formatMoney(b.personal, 'MXN')}</span>
              </li>
            ) : null)}
            <li className="flex justify-between text-xs pt-1.5 border-t border-purple-500/20 font-bold">
              <span className="text-white">Total a reembolsar</span>
              <span className="text-purple-300 tabular-nums">{formatMoney(totalReembolsoPersonal, 'MXN')}</span>
            </li>
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
                          <span className="chip text-[9px] h-4 px-1.5 chip-purple">👤 {atribuidoSocio.nombre}</span>
                        ) : (
                          <span className="chip text-[9px] h-4 px-1.5 chip-cyan">⚖ Comp.</span>
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
