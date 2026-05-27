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
      .select('id, tipo, monto, moneda, fecha, negocio_id, cuenta_id, metodo_pago, categoria, concepto, notas, monto_mxn_equivalente, tipo_cambio_usado')
      .eq('id', id)
      .single(),
    supabase.from('negocios').select('id, nombre, tipo, moneda_principal').eq('activo', true).order('nombre'),
    supabase.from('cuentas').select('id, nombre, tipo, moneda').eq('activo', true).order('nombre'),
  ])

  if (!t) notFound()
  if (t.tipo !== 'ingreso' && t.tipo !== 'gasto') notFound()

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-2xl mx-auto">
      <Link
        href={`/transacciones/${id}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-400"
      >
        <ChevronLeft className="h-4 w-4" />
        Detalle
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient">Editar</h1>
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
          monto_mxn_equivalente: t.monto_mxn_equivalente,
          tipo_cambio_usado: t.tipo_cambio_usado,
        }}
      />
    </div>
  )
}
