import { createClient } from '@/lib/supabase/server'
import { TransactionList, type Transaccion } from '@/components/transacciones/transaction-list'
import { FiltersBar } from '@/components/transacciones/filters-bar'
import { RangoSelector } from '@/components/dashboard/rango-selector'
import { formatMoney } from '@/lib/utils'
import { isRangoId, rangoFechas, type RangoId } from '@/lib/rangos'
import { totalizar } from '@/lib/agregaciones'

type SearchParams = {
  tipo?: string
  negocio?: string
  cuenta?: string
  categoria?: string
  rango?: string
  desde?: string
  hasta?: string
}

export default async function TransaccionesPage(
  { searchParams }: { searchParams: Promise<SearchParams> }
) {
  const sp = await searchParams
  const supabase = await createClient()

  const rangoId: RangoId = isRangoId(sp.rango) ? sp.rango : 'ultimos_30'
  const r = rangoFechas(rangoId, sp.desde, sp.hasta)

  // Defensive: si migración 0012 no aplicada, retry sin atribuido_a
  function buildQuery(includeAtribuido: boolean) {
    const cols = includeAtribuido
      ? 'id, tipo, monto, moneda, fecha, concepto, categoria, negocio_id, cuenta_id, monto_mxn_equivalente, tipo_cambio_usado, atribuido_a, negocios(nombre, tipo), cuentas(nombre)'
      : 'id, tipo, monto, moneda, fecha, concepto, categoria, negocio_id, cuenta_id, monto_mxn_equivalente, tipo_cambio_usado, negocios(nombre, tipo), cuentas(nombre)'
    let q = supabase
      .from('transacciones')
      .select(cols)
      .gte('fecha', r.desde)
      .lte('fecha', r.hasta)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)
    if (sp.tipo === 'gasto' || sp.tipo === 'ingreso') q = q.eq('tipo', sp.tipo)
    if (sp.negocio) q = q.eq('negocio_id', sp.negocio)
    if (sp.cuenta) q = q.eq('cuenta_id', sp.cuenta)
    if (sp.categoria) q = q.eq('categoria', sp.categoria)
    return q
  }

  let txResult = await buildQuery(true)
  if (txResult.error && /atribuido_a/.test(txResult.error.message ?? '')) {
    txResult = await buildQuery(false)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transacciones = (txResult.data ?? []) as any[]

  const [{ data: negocios }, { data: cuentas }, { data: fxLatest }] = await Promise.all([
    supabase.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('cuentas').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
  ])

  const fxRate = fxLatest ? Number(fxLatest.rate_compra) : null
  const t = totalizar(transacciones, fxRate)

  // Transacciones marcadas por el Auditor IA (cruce con observaciones reales)
  const flaggedIds: string[] = []
  let iaActivo = false
  const obsRes = await supabase
    .from('auditor_observaciones')
    .select('datos')
    .in('estado', ['nueva', 'vista'])
  if (!obsRes.error) {
    iaActivo = true
    for (const o of obsRes.data ?? []) {
      const link = (o.datos as { link?: string } | null)?.link
      const m = link?.match(/\/transacciones\/([0-9a-fA-F-]{36})/)
      if (m) flaggedIds.push(m[1])
    }
  }

  return (
    <div className="px-4 pt-5 pb-24 space-y-4 max-w-3xl mx-auto">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient">Transacciones</h1>
          <span className="chip">
            {transacciones?.length ?? 0} {(transacciones?.length ?? 0) === 1 ? 'movimiento' : 'movimientos'}
          </span>
        </div>
        <p className="text-xs text-zinc-500">{r.label}</p>
        <RangoSelector actual={rangoId} customDesde={sp.desde} customHasta={sp.hasta} />
      </header>

      {/* Resumen del rango — totales en MXN (USD convertidos al rate más reciente) */}
      {(transacciones?.length ?? 0) > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="card p-3">
            <p className="label-caps text-emerald-400">Ingresos</p>
            <p className="text-sm font-bold tabular-nums text-emerald-300">
              {formatMoney(t.ingresos_total_mxn, 'MXN')}
            </p>
            {t.ingresos_usd > 0 && (
              <p className="text-[10px] text-emerald-300/70 tabular-nums">incl. {formatMoney(t.ingresos_usd, 'USD')}</p>
            )}
          </div>
          <div className="card p-3">
            <p className="label-caps text-rose-400">Gastos</p>
            <p className="text-sm font-bold tabular-nums text-rose-300">
              {formatMoney(t.gastos_total_mxn, 'MXN')}
            </p>
            {t.gastos_usd > 0 && (
              <p className="text-[10px] text-rose-300/70 tabular-nums">incl. {formatMoney(t.gastos_usd, 'USD')}</p>
            )}
          </div>
          <div className="card p-3">
            <p className="label-caps">Utilidad</p>
            <p className={`text-sm font-bold tabular-nums ${t.utilidad_total_mxn >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {t.utilidad_total_mxn >= 0 ? '+' : ''}{formatMoney(t.utilidad_total_mxn, 'MXN')}
            </p>
          </div>
        </div>
      )}

      <FiltersBar negocios={negocios ?? []} cuentas={cuentas ?? []} />

      <TransactionList transacciones={(transacciones ?? []) as unknown as Transaccion[]} flaggedIds={flaggedIds} iaActivo={iaActivo} />

    </div>
  )
}
