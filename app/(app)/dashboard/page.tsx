import Link from 'next/link'
import { ArrowUpCircle, ArrowDownCircle, TrendingUp, Plus, ChevronRight } from 'lucide-react'
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

  const [{ data: transacciones }, { data: negocios }, { data: ultimas }, { count: nTareas }] = await Promise.all([
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
    <div className="px-4 pt-6 pb-4 space-y-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <RangoSelector actual={rangoId} />
      </header>

      {/* Utilidad principal */}
      <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 space-y-1">
        <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
          <TrendingUp className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">Utilidad · {r.label}</span>
        </div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className={`text-3xl font-bold tabular-nums ${t.utilidad_mxn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {t.utilidad_mxn >= 0 ? '+' : ''}{formatMoney(t.utilidad_mxn, 'MXN')}
          </p>
          {(t.ingresos_usd > 0 || t.gastos_usd > 0) && (
            <p className={`text-base font-semibold tabular-nums ${t.utilidad_usd >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {t.utilidad_usd >= 0 ? '+' : ''}{formatMoney(t.utilidad_usd, 'USD')}
            </p>
          )}
        </div>
        {(nTareas ?? 0) > 0 && (
          <p className="text-xs text-amber-600 pt-1">⚠ {nTareas} tareas pendientes</p>
        )}
      </div>

      {/* Ingresos / Gastos */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-emerald-600">
            <ArrowUpCircle className="h-4 w-4" />
            <span className="text-xs font-medium">Ingresos</span>
          </div>
          <p className="text-xl font-bold tabular-nums">{formatMoney(t.ingresos_mxn, 'MXN')}</p>
          {t.ingresos_usd > 0 && (
            <p className="text-xs text-zinc-500 tabular-nums">+ {formatMoney(t.ingresos_usd, 'USD')}</p>
          )}
        </div>
        <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-red-600">
            <ArrowDownCircle className="h-4 w-4" />
            <span className="text-xs font-medium">Gastos</span>
          </div>
          <p className="text-xl font-bold tabular-nums">{formatMoney(t.gastos_mxn, 'MXN')}</p>
          {t.gastos_usd > 0 && (
            <p className="text-xs text-zinc-500 tabular-nums">+ {formatMoney(t.gastos_usd, 'USD')}</p>
          )}
        </div>
      </div>

      {/* Gráfica utilidad por día */}
      <UtilidadChart data={seriePorDia} />

      {/* Barras por negocio */}
      <NegociosBar data={barNegocios} />

      {/* Top categorías */}
      <CategoriasList data={topCats} />

      {/* CTA captura */}
      <Link
        href="/transacciones/nueva"
        className="block rounded-2xl border-2 border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 text-center"
      >
        <div className="inline-flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
          <Plus className="h-5 w-5" />
          Capturar transacción
        </div>
      </Link>

      {/* Últimas */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold">Últimas</h2>
          <Link href="/transacciones" className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            Ver todas
          </Link>
        </div>
        {ultimas && ultimas.length > 0 ? (
          <ul className="rounded-2xl border bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
            {ultimas.map((u) => {
              const negocios = u.negocios as unknown as { nombre: string } | null
              const isGasto = u.tipo === 'gasto' || u.tipo === 'multa_interna'
              return (
                <li key={u.id}>
                  <Link href={`/transacciones/${u.id}`} className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-sm font-medium truncate">{u.concepto || 'Sin concepto'}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {negocios?.nombre ?? '—'} · {formatearFecha(u.fecha, 'dd MMM')}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold tabular-nums ${isGasto ? 'text-red-600' : 'text-emerald-600'}`}>
                      {isGasto ? '−' : '+'}{formatMoney(Number(u.monto), u.moneda as 'MXN' | 'USD')}
                    </p>
                    <ChevronRight className="h-4 w-4 text-zinc-300" />
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 text-center text-sm text-zinc-500">
            Aún no hay transacciones. ¡Captura la primera!
          </div>
        )}
      </section>
    </div>
  )
}
