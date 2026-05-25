import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TransactionForm } from '@/components/transacciones/transaction-form'

export default async function EditarTransaccionPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params
  const supabase = await createClient()

  const [{ data: t }, { data: negocios }, { data: cuentas }] = await Promise.all([
    supabase.from('transacciones')
      .select('id, tipo, monto, moneda, fecha, negocio_id, cuenta_id, metodo_pago, categoria, concepto, notas')
      .eq('id', id)
      .single(),
    supabase.from('negocios').select('id, nombre, tipo, moneda_principal').eq('activo', true).order('nombre'),
    supabase.from('cuentas').select('id, nombre, tipo, moneda').eq('activo', true).order('nombre'),
  ])

  if (!t) notFound()
  if (t.tipo !== 'ingreso' && t.tipo !== 'gasto') notFound() // multas/liquidaciones se editan en otra pantalla

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <Link
        href="/transacciones"
        className="inline-flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400"
      >
        <ChevronLeft className="h-4 w-4" />
        Transacciones
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Editar transacción</h1>
      </header>

      <TransactionForm
        negocios={negocios ?? []}
        cuentas={cuentas ?? []}
        defaults={{
          id: t.id,
          tipo: t.tipo as 'ingreso' | 'gasto',
          monto: String(t.monto),
          moneda: t.moneda as 'MXN' | 'USD',
          fecha: t.fecha,
          negocio_id: t.negocio_id,
          cuenta_id: t.cuenta_id,
          metodo_pago: t.metodo_pago,
          categoria: t.categoria,
          concepto: t.concepto,
          notas: t.notas,
        }}
      />
    </div>
  )
}
