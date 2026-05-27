import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Plus, ChevronRight, Sparkles, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha, hoyEnCabos } from '@/lib/fechas'
import { isRangoId, rangoFechas, type RangoId } from '@/lib/rangos'
import { totalizar, porDia, porNegocio, porCategoria } from '@/lib/agregaciones'
import { RangoSelector } from '@/components/dashboard/rango-selector'
import { UtilidadChart } from '@/components/dashboard/utilidad-chart'
import { NegociosBar } from '@/components/dashboard/negocios-bar'
import { CategoriasList } from '@/components/dashboard/categorias-list'
import { CollapsibleSection } from '@/components/dashboard/collapsible-section'

type SearchParams = { rango?: string; desde?: string; hasta?: string }

export default async function DashboardPage(
  { searchParams }: { searchParams: Promise<SearchParams> }
) {
  const sp = await searchParams
  const rangoId: RangoId = isRangoId(sp.rango) ? sp.rango : 'mes_actual'
  const r = rangoFechas(rangoId, sp.desde, sp.hasta)
  const hoy = hoyEnCabos()

  const supabase = await createClient()
  const admin = createAdminClient()

  const [
    { data: transacciones },
    { data: negocios },
    { data: ultimas },
    { count: nTareas },
    { count: nPendientes },
    { count: nMultas },
    { data: eventosProx },
    { data: porPagarRows },
    { data: porCobrarRows },
  ] = await Promise.all([
    supabase
      .from('transacciones')
      .select('tipo, monto, moneda, fecha, categoria, negocio_id, monto_mxn_equivalente, tipo_cambio_usado')
      .gte('fecha', r.desde)
      .lte('fecha', r.hasta),
    supabase.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
    supabase
      .from('transacciones')
      .select('id, tipo, monto, moneda, fecha, concepto, negocios(nombre)')
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('tareas')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['pendiente', 'en_progreso', 'vencida']),
    admin
      .from('auditor_pendientes')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'abierta'),
    admin
      .from('multas')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['propuesta', 'justificada', 'reduccion_solicitada', 'pendiente_conversacion']),
    supabase
      .from('eventos')
      .select('id, cliente_nombre, fecha_evento, monto_total, moneda')
      .gte('fecha_evento', new Date().toISOString().slice(0, 10))
      .in('estado', ['reservado', 'confirmado'])
      .order('fecha_evento', { ascending: true })
      .limit(3),
    supabase
      .from('cuentas_por_pagar')
      .select('monto_total, monto_pagado, moneda, fecha_vencimiento, estado')
      .neq('estado', 'cancelado')
      .neq('estado', 'pagado'),
    supabase
      .from('cuentas_por_cobrar')
      .select('monto_total, monto_cobrado, moneda, fecha_vencimiento, estado')
      .neq('estado', 'cancelado')
      .neq('estado', 'cobrado'),
  ])

  const rows = transacciones ?? []
  const t = totalizar(rows)
  const seriePorDia = porDia(rows)
  const barNegocios = porNegocio(rows, negocios ?? [])
  const topCats = porCategoria(rows)

  // Resumen Por Pagar
  const pp = { totalMxn: 0, totalUsd: 0, vencidoMxn: 0, vencidoUsd: 0, count: 0, vencidoCount: 0 }
  for (const c of porPagarRows ?? []) {
    const restante = Number(c.monto_total) - Number(c.monto_pagado)
    if (restante <= 0) continue
    const vencido = !!c.fecha_vencimiento && c.fecha_vencimiento < hoy
    pp.count++
    if (c.moneda === 'USD') {
      pp.totalUsd += restante
      if (vencido) { pp.vencidoUsd += restante; pp.vencidoCount++ }
    } else {
      pp.totalMxn += restante
      if (vencido) { pp.vencidoMxn += restante; pp.vencidoCount++ }
    }
  }

  // Resumen Por Cobrar
  const pc = { totalMxn: 0, totalUsd: 0, vencidoMxn: 0, vencidoUsd: 0, count: 0, vencidoCount: 0 }
  for (const c of porCobrarRows ?? []) {
    const restante = Number(c.monto_total) - Number(c.monto_cobrado)
    if (restante <= 0) continue
    const vencido = !!c.fecha_vencimiento && c.fecha_vencimiento < hoy
    pc.count++
    if (c.moneda === 'USD') {
      pc.totalUsd += restante
      if (vencido) { pc.vencidoUsd += restante; pc.vencidoCount++ }
    } else {
      pc.totalMxn += restante
      if (vencido) { pc.vencidoMxn += restante; pc.vencidoCount++ }
    }
  }

  const totalAlertas = (nTareas ?? 0) + (nMultas ?? 0) + (nPendientes ?? 0) + pp.vencidoCount + pc.vencidoCount

  return (
    <div className="px-4 pt-5 pb-8 space-y-5 max-w-3xl mx-auto">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient">Dashboard</h1>
          <span className="chip chip-cyan">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            LIVE
          </span>
        </div>
        <RangoSelector actual={rangoId} customDesde={sp.desde} customHasta={sp.hasta} />
      </div>

      {/* ============================================================
         🚨 ALERTAS — siempre arriba, default abierta
         ============================================================ */}
      {totalAlertas > 0 && (
        <CollapsibleSection
          id="alertas"
          title="Requiere atención"
          emoji="🚨"
          badge={totalAlertas}
          badgeColor="bg-rose-500/20 text-rose-300"
          defaultOpen
        >
          <div className="grid grid-cols-1 gap-2">
            {pp.vencidoCount > 0 && (
              <Link href="/por-pagar" className="card border-rose-500/40 bg-rose-500/5 p-3 flex items-center gap-3 hover:bg-rose-500/10 transition-colors">
                <span className="text-2xl">💸</span>
                <div className="flex-1 leading-tight">
                  <p className="text-sm font-bold text-rose-300">{pp.vencidoCount} cuenta{pp.vencidoCount > 1 ? 's' : ''} por pagar vencida{pp.vencidoCount > 1 ? 's' : ''}</p>
                  <p className="text-[11px] text-rose-300/70 tabular-nums">
                    {formatMoney(pp.vencidoMxn, 'MXN')}{pp.vencidoUsd > 0 ? ` + ${formatMoney(pp.vencidoUsd, 'USD')}` : ''}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-rose-300" />
              </Link>
            )}
            {pc.vencidoCount > 0 && (
              <Link href="/por-cobrar" className="card border-amber-500/40 bg-amber-500/5 p-3 flex items-center gap-3 hover:bg-amber-500/10 transition-colors">
                <span className="text-2xl">💰</span>
                <div className="flex-1 leading-tight">
                  <p className="text-sm font-bold text-amber-300">{pc.vencidoCount} cobro{pc.vencidoCount > 1 ? 's' : ''} vencido{pc.vencidoCount > 1 ? 's' : ''}</p>
                  <p className="text-[11px] text-amber-300/70 tabular-nums">
                    {formatMoney(pc.vencidoMxn, 'MXN')}{pc.vencidoUsd > 0 ? ` + ${formatMoney(pc.vencidoUsd, 'USD')}` : ''}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-amber-300" />
              </Link>
            )}
            {(nMultas ?? 0) > 0 && (
              <Link href="/multas" className="card border-rose-500/40 bg-rose-500/5 p-3 flex items-center gap-3 hover:bg-rose-500/10 transition-colors">
                <span className="text-2xl">⚠️</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-rose-300">{nMultas} multa{(nMultas ?? 0) > 1 ? 's' : ''} por resolver</p>
                </div>
                <ChevronRight className="h-4 w-4 text-rose-300" />
              </Link>
            )}
            {(nTareas ?? 0) > 0 && (
              <Link href="/tareas" className="card border-amber-500/40 bg-amber-500/5 p-3 flex items-center gap-3 hover:bg-amber-500/10 transition-colors">
                <span className="text-2xl">⌛</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-300">{nTareas} tarea{(nTareas ?? 0) > 1 ? 's' : ''} activa{(nTareas ?? 0) > 1 ? 's' : ''}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-amber-300" />
              </Link>
            )}
            {(nPendientes ?? 0) > 0 && (
              <Link href="/auditor" className="card border-cyan-500/40 bg-cyan-500/5 p-3 flex items-center gap-3 hover:bg-cyan-500/10 transition-colors">
                <span className="text-2xl">🤖</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-cyan-300">{nPendientes} pregunta{(nPendientes ?? 0) > 1 ? 's' : ''} del auditor</p>
                </div>
                <ChevronRight className="h-4 w-4 text-cyan-300" />
              </Link>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* ============================================================
         💰 RESUMEN — utilidad + KPIs + por pagar/cobrar
         ============================================================ */}
      <CollapsibleSection id="resumen" title="Resumen" emoji="💰" defaultOpen>
        {/* Hero: Utilidad TOTAL (MXN + USD convertidos al rate del día) */}
        <section className="card-glow p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="label-caps">Utilidad · {r.label}</span>
            <TrendingUp className="h-4 w-4 text-cyan-400/60" />
          </div>
          <div className="space-y-1">
            <p className={`text-4xl font-black tabular-nums ${t.utilidad_total_mxn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {t.utilidad_total_mxn >= 0 ? '+' : ''}{formatMoney(t.utilidad_total_mxn, 'MXN')}
            </p>
            {(t.ingresos_usd > 0 || t.gastos_usd > 0) && (
              <p className="text-[11px] text-zinc-500">
                Incluye {t.ingresos_usd > 0 && `${formatMoney(t.ingresos_usd, 'USD')} ingresos`}
                {t.gastos_usd > 0 && t.ingresos_usd > 0 && ' y '}
                {t.gastos_usd > 0 && `${formatMoney(t.gastos_usd, 'USD')} gastos`} convertidos al rate del día
              </p>
            )}
          </div>
        </section>

        {/* KPIs Ingresos / Gastos (totales en MXN, incluyen USD convertidos) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <ArrowUpRight className="h-4 w-4" />
              <span className="label-caps text-emerald-400">Ingresos</span>
            </div>
            <p className="text-2xl font-black tabular-nums text-emerald-300">
              {formatMoney(t.ingresos_total_mxn, 'MXN')}
            </p>
            {t.ingresos_usd > 0 && (
              <p className="text-[10px] text-zinc-500 tabular-nums">incl. {formatMoney(t.ingresos_usd, 'USD')}</p>
            )}
          </div>
          <div className="card p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-rose-400">
              <ArrowDownRight className="h-4 w-4" />
              <span className="label-caps text-rose-400">Gastos</span>
            </div>
            <p className="text-2xl font-black tabular-nums text-rose-300">
              {formatMoney(t.gastos_total_mxn, 'MXN')}
            </p>
            {t.gastos_usd > 0 && (
              <p className="text-[10px] text-zinc-500 tabular-nums">incl. {formatMoney(t.gastos_usd, 'USD')}</p>
            )}
          </div>
        </div>

        {/* Por Pagar + Por Cobrar */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/por-pagar" className="card p-4 space-y-2 hover:bg-[var(--bg-card-hover)] transition-colors">
            <div className="flex items-center gap-1.5 text-rose-400">
              <TrendingDown className="h-4 w-4" />
              <span className="label-caps text-rose-400">Por pagar</span>
            </div>
            <p className="text-xl font-black tabular-nums text-rose-300">
              {formatMoney(pp.totalMxn, 'MXN')}
            </p>
            {pp.totalUsd > 0 && (
              <p className="text-xs text-zinc-500 tabular-nums">+ {formatMoney(pp.totalUsd, 'USD')}</p>
            )}
            <p className="text-[10px] text-zinc-500">
              {pp.count} cuenta{pp.count !== 1 ? 's' : ''}{pp.vencidoCount > 0 ? ` · ${pp.vencidoCount} vencida${pp.vencidoCount > 1 ? 's' : ''}` : ''}
            </p>
          </Link>

          <Link href="/por-cobrar" className="card p-4 space-y-2 hover:bg-[var(--bg-card-hover)] transition-colors">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <TrendingUp className="h-4 w-4" />
              <span className="label-caps text-emerald-400">Por cobrar</span>
            </div>
            <p className="text-xl font-black tabular-nums text-emerald-300">
              {formatMoney(pc.totalMxn, 'MXN')}
            </p>
            {pc.totalUsd > 0 && (
              <p className="text-xs text-zinc-500 tabular-nums">+ {formatMoney(pc.totalUsd, 'USD')}</p>
            )}
            <p className="text-[10px] text-zinc-500">
              {pc.count} cuenta{pc.count !== 1 ? 's' : ''}{pc.vencidoCount > 0 ? ` · ${pc.vencidoCount} vencida${pc.vencidoCount > 1 ? 's' : ''}` : ''}
            </p>
          </Link>
        </div>

        {/* CTA Captura IA */}
        <Link
          href="/chat"
          className="block card-glow p-4 border-cyan-500/40 bg-gradient-to-br from-cyan-500/5 to-blue-500/5"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/30">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-cyan-300">Captura con IA</p>
              <p className="text-xs text-cyan-300/60">Foto, voz o texto en lenguaje natural</p>
            </div>
            <ChevronRight className="h-5 w-5 text-cyan-400" />
          </div>
        </Link>
      </CollapsibleSection>

      {/* ============================================================
         📅 PRÓXIMOS — eventos + últimas tx
         ============================================================ */}
      <CollapsibleSection id="proximos" title="Próximos & recientes" emoji="📅" defaultOpen>
        {eventosProx && eventosProx.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="label-caps">🎉 Próximos eventos</p>
              <Link href="/eventos" className="text-xs text-cyan-400 font-semibold">Ver todos →</Link>
            </div>
            <ul className="space-y-1.5">
              {eventosProx.map((e) => (
                <li key={e.id}>
                  <Link href={`/eventos/${e.id}`} className="card flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{e.cliente_nombre}</p>
                      <p className="text-xs text-zinc-500">{formatearFecha(e.fecha_evento, 'EEEE dd MMM')}</p>
                    </div>
                    <p className="text-sm font-bold text-emerald-400 tabular-nums">
                      {formatMoney(Number(e.monto_total), e.moneda as 'MXN' | 'USD')}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Últimas transacciones */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="label-caps">Últimas transacciones</p>
            <Link href="/transacciones" className="text-xs text-cyan-400 font-semibold">Ver todas →</Link>
          </div>
          {ultimas && ultimas.length > 0 ? (
            <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
              {ultimas.map((u) => {
                const negs = u.negocios as unknown as { nombre: string } | null
                const isGasto = u.tipo === 'gasto' || u.tipo === 'multa_interna'
                return (
                  <li key={u.id}>
                    <Link href={`/transacciones/${u.id}`} className="flex items-center gap-3 p-3 hover:bg-white/5 transition-colors">
                      <div className="flex-1 min-w-0 leading-tight">
                        <p className="text-sm font-semibold truncate text-zinc-100">{u.concepto || 'Sin concepto'}</p>
                        <p className="text-xs text-zinc-500 truncate">
                          {negs?.nombre ?? '—'} · {formatearFecha(u.fecha, 'dd MMM')}
                        </p>
                      </div>
                      <p className={`text-sm font-bold tabular-nums ${isGasto ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {isGasto ? '−' : '+'}{formatMoney(Number(u.monto), u.moneda as 'MXN' | 'USD')}
                      </p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="card border-dashed p-6 text-center text-sm text-zinc-500">
              Sin transacciones aún. Usa Captura IA o el botón manual.
            </div>
          )}
        </div>

        <Link
          href="/transacciones/nueva"
          className="block btn-ghost flex items-center justify-center gap-2 text-cyan-300"
        >
          <Plus className="h-4 w-4" />
          Captura manual
        </Link>
      </CollapsibleSection>

      {/* ============================================================
         📊 ANALYTICS — gráficas, plegadas por default
         ============================================================ */}
      <CollapsibleSection id="analytics" title="Analytics" emoji="📊" defaultOpen={false}>
        <UtilidadChart data={seriePorDia} />
        <NegociosBar data={barNegocios} />
        <CategoriasList data={topCats} />
      </CollapsibleSection>
    </div>
  )
}
