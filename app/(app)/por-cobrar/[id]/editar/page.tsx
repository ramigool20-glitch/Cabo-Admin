import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CuentaCobrarForm } from '@/components/por-cobrar/cuenta-form'

export default async function EditarCuentaPorCobrarPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params
  const supabase = await createClient()

  const [{ data: cuenta }, { data: negocios }] = await Promise.all([
    supabase.from('cuentas_por_cobrar').select('*').eq('id', id).single(),
    supabase.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  if (!cuenta) notFound()

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 max-w-2xl mx-auto">
      <Link href={`/por-cobrar/${id}`} className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Volver
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient">Editar cuenta por cobrar</h1>
        <p className="text-sm text-zinc-400">Modifica cualquier detalle. Cobros existentes no se borran.</p>
      </header>

      <CuentaCobrarForm
        negocios={negocios ?? []}
        modo="editar"
        cuenta={{
          id: cuenta.id,
          cliente_nombre: cuenta.cliente_nombre,
          cliente_telefono: cuenta.cliente_telefono,
          cliente_email: cuenta.cliente_email,
          negocio_id: cuenta.negocio_id,
          concepto: cuenta.concepto,
          monto_total: Number(cuenta.monto_total),
          moneda: cuenta.moneda as 'MXN' | 'USD',
          fecha_emision: cuenta.fecha_emision,
          fecha_vencimiento: cuenta.fecha_vencimiento,
          categoria: cuenta.categoria,
          referencia: cuenta.referencia,
          notas: cuenta.notas,
        }}
      />
    </div>
  )
}
