import { createClient } from '@/lib/supabase/server'
import { TransactionList, type Transaccion } from '@/components/transacciones/transaction-list'
import { FiltersBar } from '@/components/transacciones/filters-bar'
import { RangoSelector } from '@/components/dashboard/rango-selector'
import { Fab } from '@/components/ui/fab'
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

  let query = supabase
    .from('transacciones')
    .select('id, tipo, monto, moneda, fecha, concepto, categoria, negocio_id, cuenta_id, negocios(nombre), cuentas(nombre)')
    .gte('fecha', r.desde)
    .lte('fecha', r.hasta)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (sp.tipo === 'gasto' || sp.tipo === 'ingreso') query = query.eq('tipo', sp.tipo)
  if (sp.negocio) query = query.eq('negocio_id', sp.negocio)
  if (sp.cuenta) query = query.eq('cuenta_id', sp.cuenta)
  if (sp.categoria) query = query.eq('categoria', sp.categoria)

  const [{ data: transacciones }, { data: negocios }, { data: cuentas }] = await Promise.all([
    query,
    supabase.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('cuentas').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  const t = totalizar(transacciones ?? [])

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

      {/* Resumen del rango */}
      {(transacciones?.length ?? 0) > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="card p-3">
            <p className="label-caps text-emerald-400">Ingresos</p>
            <p className="text-sm font-bold tabular-nums text-emerald-300">
              {formatMoney(t.ingresos_mxn, 'MXN')}
            </p>
            {t.ingresos_usd > 0 && (
              <p className="text-[10px] text-emerald-300/70">+ {formatMoney(t.ingresos_usd, 'USD')}</p>
            )}
          </div>
          <div className="card p-3">
            <p className="label-caps text-rose-400">Gastos</p>
            <p className="text-sm font-bold tabular-nums text-rose-300">
              {formatMoney(t.gastos_mxn, 'MXN')}
            </p>
            {t.gastos_usd > 0 && (
              <p className="text-[10px] text-rose-300/70">+ {formatMoney(t.gastos_usd, 'USD')}</p>
            )}
          </div>
          <div className="card p-3">
            <p className="label-caps">Utilidad</p>
            <p className={`text-sm font-bold tabular-nums ${t.utilidad_mxn >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
              {t.utilidad_mxn >= 0 ? '+' : ''}{formatMoney(t.utilidad_mxn, 'MXN')}
            </p>
          </div>
        </div>
      )}

      <FiltersBar negocios={negocios ?? []} cuentas={cuentas ?? []} />

      <TransactionList transacciones={(transacciones ?? []) as unknown as Transaccion[]} />

      <Fab href="/transacciones/nueva" label="Nueva transacción" />
    </div>
  )
}
