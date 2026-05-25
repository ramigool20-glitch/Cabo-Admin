import { createClient } from '@/lib/supabase/server'
import { TransactionList, type Transaccion } from '@/components/transacciones/transaction-list'
import { FiltersBar } from '@/components/transacciones/filters-bar'
import { Fab } from '@/components/ui/fab'

type SearchParams = { tipo?: string; negocio?: string; cuenta?: string }

export default async function TransaccionesPage(
  { searchParams }: { searchParams: Promise<SearchParams> }
) {
  const sp = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('transacciones')
    .select('id, tipo, monto, moneda, fecha, concepto, categoria, negocios(nombre), cuentas(nombre)')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (sp.tipo === 'gasto' || sp.tipo === 'ingreso') query = query.eq('tipo', sp.tipo)
  if (sp.negocio) query = query.eq('negocio_id', sp.negocio)
  if (sp.cuenta) query = query.eq('cuenta_id', sp.cuenta)

  const [{ data: transacciones }, { data: negocios }, { data: cuentas }] = await Promise.all([
    query,
    supabase.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
    supabase.from('cuentas').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Transacciones</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {transacciones?.length ?? 0} {(transacciones?.length ?? 0) === 1 ? 'movimiento' : 'movimientos'}
        </p>
      </header>

      <FiltersBar negocios={negocios ?? []} cuentas={cuentas ?? []} />

      <TransactionList transacciones={(transacciones ?? []) as unknown as Transaccion[]} />

      <Fab href="/transacciones/nueva" label="Nueva transacción" />
    </div>
  )
}
