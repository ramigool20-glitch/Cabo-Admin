import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import { CompensacionForm } from '@/components/nomina/compensacion-form'
import { PagoForm } from '@/components/nomina/pago-form'
import { deleteCompensacion } from '@/app/(app)/nomina/actions'

export default async function DetalleEmpleadoPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params
  const supabase = await createClient()

  const [{ data: empleado }, { data: comps }, { data: pagos }, { data: negocios }, { data: cuentas }] =
    await Promise.all([
      supabase.from('empleados').select('*').eq('id', id).single(),
      supabase
        .from('empleado_compensacion')
        .select('*, negocios(nombre)')
        .eq('empleado_id', id)
        .eq('activo', true),
      supabase
        .from('pagos_nomina')
        .select('id, fecha_pago, total, moneda, negocios(nombre)')
        .eq('empleado_id', id)
        .order('fecha_pago', { ascending: false })
        .limit(10),
      supabase.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('cuentas').select('id, nombre, moneda').eq('activo', true).order('nombre'),
    ])

  if (!empleado) notFound()

  const compsForPago = (comps ?? []).map((c) => ({
    id: c.id,
    negocio_id: c.negocio_id,
    negocio_nombre: (c.negocios as unknown as { nombre: string } | null)?.nombre ?? '—',
    sueldo_base: Number(c.sueldo_base),
    comision_porcentaje: Number(c.comision_porcentaje),
    moneda: c.moneda as 'MXN' | 'USD',
    frecuencia_pago: c.frecuencia_pago,
  }))

  return (
    <div className="px-4 pt-4 pb-6 space-y-5">
      <Link href="/nomina" className="inline-flex items-center gap-1 text-sm text-zinc-600">
        <ChevronLeft className="h-4 w-4" /> Nómina
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{empleado.nombre}</h1>
        <p className="text-sm text-zinc-400">{empleado.puesto || 'Sin puesto'}</p>
      </header>

      {/* Compensaciones */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold px-1">Compensaciones</h2>
        {comps && comps.length > 0 ? (
          <ul className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)] overflow-hidden">
            {comps.map((c) => {
              const neg = c.negocios as unknown as { nombre: string } | null
              return (
                <li key={c.id} className="p-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{neg?.nombre ?? '—'}</p>
                    <p className="text-xs text-zinc-500">
                      Base {formatMoney(Number(c.sueldo_base), c.moneda)} · {c.comision_porcentaje}% sobre {c.comision_base ?? '—'} · {c.frecuencia_pago}
                      {c.dia_de_pago && ` · día ${c.dia_de_pago}`}
                    </p>
                  </div>
                  <form action={deleteCompensacion.bind(null, c.id, id)}>
                    <button
                      type="submit"
                      aria-label="Eliminar"
                      className="text-zinc-400 hover:text-red-600 p-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Aún no hay compensaciones.</p>
        )}

        <details className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
          <summary className="text-sm font-medium cursor-pointer">+ Agregar compensación</summary>
          <div className="pt-3">
            <CompensacionForm empleadoId={id} negocios={negocios ?? []} />
          </div>
        </details>
      </section>

      {/* Registrar pago */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold px-1">Registrar pago</h2>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4">
          <PagoForm empleadoId={id} compensaciones={compsForPago} cuentas={cuentas ?? []} />
        </div>
      </section>

      {/* Pagos */}
      {pagos && pagos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold px-1">Histórico de pagos</h2>
          <ul className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)] overflow-hidden">
            {pagos.map((p) => {
              const neg = p.negocios as unknown as { nombre: string } | null
              return (
                <li key={p.id} className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <p className="font-medium">{formatearFecha(p.fecha_pago, 'dd MMM yyyy')}</p>
                    <p className="text-xs text-zinc-500">{neg?.nombre ?? '—'}</p>
                  </div>
                  <p className="font-semibold tabular-nums">{formatMoney(Number(p.total), p.moneda as 'MXN' | 'USD')}</p>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
