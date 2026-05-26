import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import { isRangoId, rangoFechas, type RangoId } from '@/lib/rangos'
import { totalizar, porCategoria } from '@/lib/agregaciones'
import { calcularMetricas } from '@/lib/roas'
import { RangoSelector } from '@/components/dashboard/rango-selector'
import { CategoriasList } from '@/components/dashboard/categorias-list'
import { RoasCard } from '@/components/negocios/roas-card'

export default async function DetalleNegocioPage(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ rango?: string; desde?: string; hasta?: string }> }
) {
  const { id } = await props.params
  const sp = await props.searchParams
  const rangoId: RangoId = isRangoId(sp.rango) ? sp.rango : 'mes_actual'
  const r = rangoFechas(rangoId, sp.desde, sp.hasta)

  const supabase = await createClient()

  const { data: negocio } = await supabase
    .from('negocios')
    .select('id, nombre, tipo, moneda_principal, activo, url, notas')
    .eq('id', id)
    .single()

  if (!negocio) notFound()

  const esPagina = negocio.tipo === 'pagina_digital'
  const monedaNeg = negocio.moneda_principal as 'MXN' | 'USD'

  const [
    { data: transacciones },
    { data: ultimas },
    { data: ventas },
    { data: gastos_ads },
  ] = await Promise.all([
    supabase
      .from('transacciones')
      .select('tipo, monto, moneda, fecha, categoria, negocio_id')
      .eq('negocio_id', id)
      .gte('fecha', r.desde)
      .lte('fecha', r.hasta),
    supabase
      .from('transacciones')
      .select('id, tipo, monto, moneda, fecha, concepto')
      .eq('negocio_id', id)
      .order('created_at', { ascending: false })
      .limit(10),
    esPagina
      ? supabase
          .from('ventas')
          .select('precio_venta, costo_producto, moneda')
          .eq('negocio_id', id)
          .gte('fecha', r.desde)
          .lte('fecha', r.hasta)
      : Promise.resolve({ data: [] }),
    esPagina
      ? supabase
          .from('gastos_ads')
          .select('monto, moneda')
          .eq('negocio_id', id)
          .gte('fecha', r.desde)
          .lte('fecha', r.hasta)
      : Promise.resolve({ data: [] }),
  ])

  const t = totalizar(transacciones ?? [])
  const topCats = porCategoria(transacciones ?? [])
  const metricas = esPagina
    ? calcularMetricas({ ventas: ventas ?? [], gastos_ads: gastos_ads ?? [] })
    : null

  return (
    <div className="px-4 pt-4 pb-4 space-y-5">
      <Link
        href="/negocios"
        className="inline-flex items-center gap-1 text-sm text-zinc-400"
      >
        <ChevronLeft className="h-4 w-4" />
        Negocios
      </Link>

      <header className="space-y-2">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold tracking-tight">{negocio.nombre}</h1>
          <p className="text-xs text-zinc-500 capitalize">
            {negocio.tipo.replace('_', ' ')} · {monedaNeg}
          </p>
          {(negocio as { url?: string | null }).url && (
            <a
              href={(negocio as { url: string }).url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-emerald-700 dark:text-emerald-400 hover:underline mt-1 break-all"
            >
              {(negocio as { url: string }).url.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
        <RangoSelector actual={rangoId} customDesde={sp.desde} customHasta={sp.hasta} />
      </header>

      {/* Utilidad principal */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 space-y-1">
        <div className="flex items-center gap-1.5 text-zinc-400">
          <TrendingUp className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">Utilidad · {r.label}</span>
        </div>
        <p className={`text-3xl font-bold tabular-nums ${t.utilidad_mxn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {t.utilidad_mxn >= 0 ? '+' : ''}{formatMoney(t.utilidad_mxn, 'MXN')}
        </p>
        {(t.ingresos_usd > 0 || t.gastos_usd > 0) && (
          <p className={`text-sm font-semibold tabular-nums ${t.utilidad_usd >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {t.utilidad_usd >= 0 ? '+' : ''}{formatMoney(t.utilidad_usd, 'USD')}
          </p>
        )}
      </div>

      {/* Ingresos / Gastos */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 space-y-1">
          <div className="flex items-center gap-1.5 text-emerald-600">
            <ArrowUpCircle className="h-4 w-4" />
            <span className="text-xs font-medium">Ingresos</span>
          </div>
          <p className="text-xl font-bold tabular-nums">{formatMoney(t.ingresos_mxn, 'MXN')}</p>
          {t.ingresos_usd > 0 && (
            <p className="text-xs text-zinc-500 tabular-nums">+ {formatMoney(t.ingresos_usd, 'USD')}</p>
          )}
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 space-y-1">
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

      {/* Métricas página digital (ROAS) */}
      {metricas && <RoasCard m={metricas} moneda={monedaNeg} />}

      {/* Top categorías de gasto */}
      <CategoriasList data={topCats} />

      {/* Últimas transacciones */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold px-1">Últimas transacciones</h2>
        {ultimas && ultimas.length > 0 ? (
          <ul className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)] overflow-hidden">
            {ultimas.map((u) => {
              const isGasto = u.tipo === 'gasto' || u.tipo === 'multa_interna'
              const editable = u.tipo === 'ingreso' || u.tipo === 'gasto'
              return (
                <li key={u.id}>
                  <Link
                    href={editable ? `/transacciones/${u.id}` : '#'}
                    className={editable ? 'flex items-center gap-3 p-3 active:bg-zinc-50' : 'flex items-center gap-3 p-3 pointer-events-none'}
                  >
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-sm font-medium truncate">{u.concepto || 'Sin concepto'}</p>
                      <p className="text-xs text-zinc-500">{formatearFecha(u.fecha, 'dd MMM yyyy')}</p>
                    </div>
                    <p className={`text-sm font-semibold tabular-nums ${isGasto ? 'text-red-600' : 'text-emerald-600'}`}>
                      {isGasto ? '−' : '+'}{formatMoney(Number(u.monto), u.moneda as 'MXN' | 'USD')}
                    </p>
                    {editable && <ChevronRight className="h-4 w-4 text-zinc-300" />}
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 text-center text-sm text-zinc-500">
            Sin transacciones de este negocio aún.
          </div>
        )}
      </section>
    </div>
  )
}
