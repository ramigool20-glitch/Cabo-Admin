import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Megaphone, TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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

function detectarPlataforma(categoria: string | null, concepto: string | null): string {
  const t = `${categoria ?? ''} ${concepto ?? ''}`.toLowerCase()
  if (/meta|facebook|fb|instagram|ig/.test(t)) return 'meta'
  if (/google|adwords|youtube/.test(t)) return 'google'
  if (/tiktok|tik\s?tok/.test(t)) return 'tiktok'
  return 'otro'
}

function esCategoriaAds(categoria: string | null, concepto: string | null): boolean {
  const cat = (categoria ?? '').toLowerCase().trim()
  if (cat === 'ads' || cat.startsWith('ads-') || cat.startsWith('ads ')) return true
  const con = (concepto ?? '').toLowerCase()
  return /\b(ads?|anuncio|publicidad|campa[ñn]a|advert)\b/.test(con) &&
         /(meta|facebook|fb|instagram|google|adwords|tiktok)/.test(con)
}

type AdItem = {
  id: string
  source: 'transaccion' | 'gasto_ad'
  fecha: string
  monto: number
  moneda: 'MXN' | 'USD'
  monto_mxn: number
  plataforma: string
  concepto: string | null
  metodo_captura: string | null
  created_at: string
}

export default async function AdsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: negocio } = await supabase
    .from('negocios')
    .select('id, nombre, tipo')
    .eq('id', id)
    .single()

  if (!negocio) notFound()

  // FX rate más reciente (fallback runtime)
  const { data: fxLatest } = await admin
    .from('fx_rates')
    .select('rate_compra')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  const fxRate = fxLatest ? Number(fxLatest.rate_compra) : null

  // 1) Trae todas las transacciones del negocio (cualquier categoría)
  const { data: txs } = await supabase
    .from('transacciones')
    .select('id, tipo, monto, moneda, fecha, categoria, concepto, metodo_captura, notas, monto_mxn_equivalente, tipo_cambio_usado, created_at')
    .eq('negocio_id', id)
    .eq('tipo', 'gasto')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  // 2) Trae gastos_ads (con plataforma explícita)
  const { data: ads } = await supabase
    .from('gastos_ads')
    .select('id, fecha, monto, moneda, plataforma, monto_mxn, tipo_cambio_usado, metodo_captura, created_at')
    .eq('negocio_id', id)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  // Construir lista unificada
  const list: AdItem[] = []
  const linkedTxIds = new Set<string>()  // tx que ya tienen gastos_ads correspondiente

  // Primero: gastos_ads explícitos (tienen plataforma definida)
  for (const g of ads ?? []) {
    const monto = Number(g.monto)
    const eqMxn = g.monto_mxn != null
      ? Number(g.monto_mxn)
      : g.moneda === 'MXN' ? monto : (fxRate ? monto * fxRate : 0)
    list.push({
      id: g.id,
      source: 'gasto_ad',
      fecha: g.fecha,
      monto,
      moneda: g.moneda as 'MXN' | 'USD',
      monto_mxn: eqMxn,
      plataforma: g.plataforma ?? 'otro',
      concepto: null,
      metodo_captura: g.metodo_captura,
      created_at: g.created_at,
    })
  }

  // Identifica qué tx ya están "marcadas" como sincronizadas
  for (const t of txs ?? []) {
    if (t.notas && /Sincronizado desde gastos_ads/.test(t.notas)) {
      linkedTxIds.add(t.id)
    }
  }

  // Segundo: transacciones con categoría ads que NO tengan gastos_ads ligado
  for (const t of txs ?? []) {
    if (linkedTxIds.has(t.id)) continue
    if (!esCategoriaAds(t.categoria, t.concepto)) continue

    const monto = Number(t.monto)
    const eqMxn = t.monto_mxn_equivalente != null
      ? Number(t.monto_mxn_equivalente)
      : t.moneda === 'MXN' ? monto : (fxRate ? monto * fxRate : 0)
    list.push({
      id: t.id,
      source: 'transaccion',
      fecha: t.fecha,
      monto,
      moneda: t.moneda as 'MXN' | 'USD',
      monto_mxn: eqMxn,
      plataforma: detectarPlataforma(t.categoria, t.concepto),
      concepto: t.concepto,
      metodo_captura: t.metodo_captura,
      created_at: t.created_at,
    })
  }

  // Ordena por fecha desc
  list.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at))

  // KPIs
  const totalMxn = list.reduce((acc, a) => acc + a.monto_mxn, 0)
  const totalUsdOriginal = list.filter((a) => a.moneda === 'USD').reduce((acc, a) => acc + a.monto, 0)
  const promedio = list.length ? totalMxn / list.length : 0

  // Por plataforma
  const porPlat = list.reduce<Record<string, number>>((acc, a) => {
    const p = a.plataforma || 'otro'
    acc[p] = (acc[p] ?? 0) + a.monto_mxn
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

      <GastoAdQuickForm negocioId={id} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold px-1">Historial</h2>
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 text-center text-sm text-zinc-500">
            Sin gastos de ads aún. Agrega el primero arriba.
          </div>
        ) : (
          <ul className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)] overflow-hidden">
            {list.map((a) => (
              <li key={`${a.source}-${a.id}`} className="p-3 flex items-center gap-3">
                <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${PLATAFORMA_COLORS[a.plataforma] ?? PLATAFORMA_COLORS.otro}`}>
                  {PLATAFORMA_LABEL[a.plataforma] ?? a.plataforma}
                </span>
                <div className="flex-1 min-w-0 leading-tight">
                  <p className="text-xs text-zinc-500">{formatearFecha(a.fecha, 'dd MMM yyyy')}</p>
                  {a.concepto && (
                    <p className="text-[10px] text-zinc-600 truncate">{a.concepto}</p>
                  )}
                  {a.source === 'transaccion' && (
                    <p className="text-[9px] text-zinc-700">desde transacción</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums text-amber-300">
                    {formatMoney(a.monto, a.moneda)}
                  </p>
                  {a.moneda === 'USD' && (
                    <p className="text-[10px] text-zinc-500 tabular-nums">≈ {formatMoney(a.monto_mxn, 'MXN')}</p>
                  )}
                </div>
                {a.source === 'gasto_ad' && (
                  <EliminarItemBtn
                    id={a.id}
                    negocioId={id}
                    tipo="ad"
                    etiqueta={`${formatMoney(a.monto, a.moneda)} · ${PLATAFORMA_LABEL[a.plataforma]}`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
