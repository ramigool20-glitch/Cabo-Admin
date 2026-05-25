import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, TrendingUp, Plus, ChevronRight, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import { isRangoId, rangoFechas, type RangoId } from '@/lib/rangos'
import { totalizar, porDia, porNegocio, porCategoria } from '@/lib/agregaciones'
import { RangoSelector } from '@/components/dashboard/rango-selector'
import { UtilidadChart } from '@/components/dashboard/utilidad-chart'
import { NegociosBar } from '@/components/dashboard/negocios-bar'
import { CategoriasList } from '@/components/dashboard/categorias-list'

type SearchParams = { rango?: string }

export default async function DashboardPage(
  { searchParams }: { searchParams: Promise<SearchParams> }
) {
  const sp = await searchParams
  const rangoId: RangoId = isRangoId(sp.rango) ? sp.rango : 'mes_actual'
  const r = rangoFechas(rangoId)

  const supabase = await createClient()
  const admin = createAdminClient()

  const [{ data: transacciones }, { data: negocios }, { data: ultimas }, { count: nTareas }] =
    await Promise.all([
      supabase
        .from('transacciones')
        .select('tipo, monto, moneda, fecha, categoria, negocio_id')
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
        .in('estado', ['pendiente', 'en_progreso']),
    ])

  const rows = transacciones ?? []
  const t = totalizar(rows)
  const seriePorDia = porDia(rows)
  const barNegocios = porNegocio(rows, negocios ?? [])
  const topCats = porCategoria(rows)

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
        <RangoSelector actual={rangoId} />
      </div>

      {/* Hero: Utilidad principal */}
      <section className="card-glow p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="label-caps">Utilidad · {r.label}</span>
          <TrendingUp className="h-4 w-4 text-cyan-400/60" />
        </div>
        <div className="space-y-1">
          <p className={`text-4xl font-black tabular-nums ${t.utilidad_mxn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {t.utilidad_mxn >= 0 ? '+' : ''}{formatMoney(t.utilidad_mxn, 'MXN')}
          </p>
          {(t.ingresos_usd > 0 || t.gastos_usd > 0) && (
            <p className={`text-base font-bold tabular-nums ${t.utilidad_usd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {t.utilidad_usd >= 0 ? '+' : ''}{formatMoney(t.utilidad_usd, 'USD')}
            </p>
          )}
        </div>
      </section>

      {/* Tareas pendientes warning */}
      {(nTareas ?? 0) > 0 && (
        <Link href="/tareas" className="block">
          <div className="card-glow border-amber-500/40 p-4 flex items-center gap-3 hover:bg-amber-500/5 transition-colors">
            <span className="text-2xl">⌛</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-300">{nTareas} tareas pendientes</p>
              <p className="text-xs text-amber-300/70">Toca para revisar</p>
            </div>
            <ChevronRight className="h-5 w-5 text-amber-300" />
          </div>
        </Link>
      )}

      {/* KPIs Ingresos / Gastos */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <ArrowUpRight className="h-4 w-4" />
            <span className="label-caps text-emerald-400">Ingresos</span>
          </div>
          <p className="text-2xl font-black tabular-nums text-emerald-300">
            {formatMoney(t.ingresos_mxn, 'MXN')}
          </p>
          {t.ingresos_usd > 0 && (
            <p className="text-xs text-zinc-500 tabular-nums">+ {formatMoney(t.ingresos_usd, 'USD')}</p>
          )}
        </div>
        <div className="card p-4 space-y-2">
          <div className="flex items-center gap-1.5 text-rose-400">
            <ArrowDownRight className="h-4 w-4" />
            <span className="label-caps text-rose-400">Gastos</span>
          </div>
          <p className="text-2xl font-black tabular-nums text-rose-300">
            {formatMoney(t.gastos_mxn, 'MXN')}
          </p>
          {t.gastos_usd > 0 && (
            <p className="text-xs text-zinc-500 tabular-nums">+ {formatMoney(t.gastos_usd, 'USD')}</p>
          )}
        </div>
      </div>

      {/* Captura IA CTA */}
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

      {/* Gráfica utilidad por día */}
      <UtilidadChart data={seriePorDia} />

      {/* Barras por negocio */}
      <NegociosBar data={barNegocios} />

      {/* Top categorías */}
      <CategoriasList data={topCats} />

      {/* CTA captura manual */}
      <Link
        href="/transacciones/nueva"
        className="block btn-ghost flex items-center justify-center gap-2 text-cyan-300"
      >
        <Plus className="h-4 w-4" />
        Captura manual
      </Link>

      {/* Últimas transacciones */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Últimas</h2>
          <Link href="/transacciones" className="text-xs text-cyan-400 font-semibold">
            Ver todas →
          </Link>
        </div>
        {ultimas && ultimas.length > 0 ? (
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {ultimas.map((u) => {
              const negocios = u.negocios as unknown as { nombre: string } | null
              const isGasto = u.tipo === 'gasto' || u.tipo === 'multa_interna'
              return (
                <li key={u.id}>
                  <Link href={`/transacciones/${u.id}`} className="flex items-center gap-3 p-3 hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-sm font-semibold truncate text-zinc-100">{u.concepto || 'Sin concepto'}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {negocios?.nombre ?? '—'} · {formatearFecha(u.fecha, 'dd MMM')}
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
      </section>
    </div>
  )
}
