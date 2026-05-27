import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Megaphone, TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import { GastoAdQuickForm } from '@/components/negocios/gasto-ad-quick-form'
import { EliminarItemBtn } from '@/components/negocios/eliminar-item-btn'

const PLATAFORMA_COLORS: Record<string, string> = {
  meta: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  google: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  tiktok: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
  otro: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/40',
}

const PLATAFORMA_LABEL: Record<string, string> = {
  meta: 'Meta',
  google: 'Google',
  tiktok: 'TikTok',
  otro: 'Otro',
}

export default async function AdsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: negocio } = await supabase
    .from('negocios')
    .select('id, nombre, tipo')
    .eq('id', id)
    .single()

  if (!negocio) notFound()

  const { data: ads } = await supabase
    .from('gastos_ads')
    .select('id, fecha, monto, moneda, plataforma, monto_mxn, tipo_cambio_usado, metodo_captura')
    .eq('negocio_id', id)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  const list = ads ?? []

  // KPIs
  const totalMxn = list.reduce((acc, a) => acc + Number(a.monto_mxn ?? 0), 0)
  const totalUsdOriginal = list.filter((a) => a.moneda === 'USD').reduce((acc, a) => acc + Number(a.monto), 0)
  const promedio = list.length ? totalMxn / list.length : 0

  // Agrupar por plataforma
  const porPlat = list.reduce<Record<string, number>>((acc, a) => {
    const p = a.plataforma || 'otro'
    acc[p] = (acc[p] ?? 0) + Number(a.monto_mxn ?? 0)
    return acc
  }, {})

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      <Link href={`/negocios/${id}`} className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" />
        {negocio.nombre}
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
          <span className="h-8 w-8 rounded-lg inline-flex items-center justify-center bg-amber-500/20 border border-amber-500/40">
            <Megaphone className="h-4 w-4 text-amber-300" />
          </span>
          Gastos de Ads
        </h1>
        <p className="text-xs text-zinc-500">{negocio.nombre} · {list.length} {list.length === 1 ? 'entrada' : 'entradas'}</p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3">
          <div className="flex items-center gap-1.5 text-amber-400">
            <TrendingDown className="h-3.5 w-3.5" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Total</span>
          </div>
          <p className="text-xl font-bold tabular-nums mt-1">{formatMoney(totalMxn, 'MXN')}</p>
          {totalUsdOriginal > 0 && (
            <p className="text-[10px] text-zinc-500 tabular-nums">incl. {formatMoney(totalUsdOriginal, 'USD')}</p>
          )}
        </div>
        <div className="card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Promedio / entrada</p>
          <p className="text-xl font-bold tabular-nums mt-1">{formatMoney(promedio, 'MXN')}</p>
        </div>
      </div>

      {/* Por plataforma */}
      {Object.keys(porPlat).length > 1 && (
        <div className="card p-3 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Por plataforma</p>
          {Object.entries(porPlat).sort(([, a], [, b]) => b - a).map(([p, monto]) => {
            const pct = totalMxn > 0 ? (monto / totalMxn) * 100 : 0
            return (
              <div key={p} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] border ${PLATAFORMA_COLORS[p] ?? PLATAFORMA_COLORS.otro}`}>
                    {PLATAFORMA_LABEL[p] ?? p}
                  </span>
                  <span className="tabular-nums font-medium">{formatMoney(monto, 'MXN')}</span>
                </div>
                <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Form */}
      <GastoAdQuickForm negocioId={id} />

      {/* Lista */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold px-1">Historial</h2>
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 text-center text-sm text-zinc-500">
            Sin gastos de ads aún. Agrega el primero arriba.
          </div>
        ) : (
          <ul className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)] overflow-hidden">
            {list.map((a) => {
              const mxnEq = Number(a.monto_mxn ?? 0)
              return (
                <li key={a.id} className="p-3 flex items-center gap-3">
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${PLATAFORMA_COLORS[a.plataforma || 'otro'] ?? PLATAFORMA_COLORS.otro}`}>
                    {PLATAFORMA_LABEL[a.plataforma || 'otro'] ?? a.plataforma}
                  </span>
                  <div className="flex-1 min-w-0 leading-tight">
                    <p className="text-xs text-zinc-500">{formatearFecha(a.fecha, 'dd MMM yyyy')}</p>
                    {a.metodo_captura === 'foto' && (
                      <p className="text-[10px] text-zinc-600">📸 desde foto</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-amber-300">
                      {formatMoney(Number(a.monto), a.moneda as 'MXN' | 'USD')}
                    </p>
                    {a.moneda === 'USD' && (
                      <p className="text-[10px] text-zinc-500 tabular-nums">≈ {formatMoney(mxnEq, 'MXN')}</p>
                    )}
                  </div>
                  <EliminarItemBtn
                    id={a.id}
                    negocioId={id}
                    tipo="ad"
                    etiqueta={`${formatMoney(Number(a.monto), a.moneda as 'MXN' | 'USD')} · ${PLATAFORMA_LABEL[a.plataforma || 'otro']}`}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
