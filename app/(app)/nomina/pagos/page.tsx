import Link from 'next/link'
import { ChevronLeft, DollarSign, Stethoscope, ChevronRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { periodoActual } from '@/lib/nomina-calculo'
import { PagoEmpleadoCard, type PagoEmpleado } from '@/components/nomina/pago-empleado-card'

export default async function NominaPagosPage() {
  const admin = createAdminClient()

  const [{ data: empleados }, { data: cuentas }, { data: negocios }] = await Promise.all([
    admin.from('empleados')
      .select('id, nombre, puesto, empleado_compensacion(sueldo_base, moneda, comision_porcentaje, comision_base, frecuencia_pago, negocio_id, activo)')
      .eq('activo', true).order('nombre'),
    admin.from('cuentas').select('id, nombre').eq('activo', true).order('nombre'),
    admin.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  const pagos: PagoEmpleado[] = []

  for (const e of empleados ?? []) {
    const comps = (e.empleado_compensacion as Array<{
      sueldo_base: number; comision_porcentaje: number | null; comision_base: string | null
      frecuencia_pago: 'mensual' | 'quincenal' | 'semanal'; negocio_id: string | null; activo: boolean
    }> | null) ?? []
    const comp = comps.find((c) => c.activo)
    if (!comp) continue

    // La enfermera tiene su propia tarjeta (clinica_pagos). Saltamos aquí.
    const esEnfermera = /enfermera|patricia/i.test(e.puesto ?? '') || /patricia/i.test(e.nombre)
    if (esEnfermera) continue

    const periodo = periodoActual(comp.frecuencia_pago)
    const sueldo = Number(comp.sueldo_base) || 0
    let comisiones = 0
    let propinas = 0
    const bono = 0
    let detalleComision: string | undefined

    if (comp.comision_porcentaje && comp.comision_porcentaje > 0 && comp.comision_base === 'venta_total') {
      // Comisión % sobre ventas del negocio en el periodo
      let q = admin.from('transacciones')
        .select('monto_mxn_equivalente, monto, moneda')
        .eq('tipo', 'ingreso')
        .gte('fecha', periodo.inicio).lte('fecha', periodo.fin)
      if (comp.negocio_id) q = q.eq('negocio_id', comp.negocio_id)
      const { data: ventas } = await q
      const totalVentas = (ventas ?? []).reduce((s, v) => s + Number(v.monto_mxn_equivalente ?? v.monto), 0)
      comisiones = totalVentas * (Number(comp.comision_porcentaje) / 100)
      detalleComision = `${comp.comision_porcentaje}% de ${totalVentas.toFixed(0)} ventas`
    }

    // Extras no pagados del periodo
    const { data: extrasData } = await admin
      .from('empleado_extras')
      .select('monto')
      .eq('empleado_id', e.id).eq('pagado', false)
      .gte('fecha', periodo.inicio).lte('fecha', periodo.fin)
    const extras = (extrasData ?? []).reduce((s, x) => s + Number(x.monto), 0)

    // ¿Ya pagado este periodo?
    const { data: yaPago } = await admin
      .from('nomina_pagos')
      .select('id')
      .eq('empleado_id', e.id)
      .eq('periodo_inicio', periodo.inicio)
      .eq('pagado', true)
      .maybeSingle()

    const total = sueldo + comisiones + propinas + bono + extras

    pagos.push({
      empleadoId: e.id, nombre: e.nombre, puesto: e.puesto,
      periodoInicio: periodo.inicio, periodoFin: periodo.fin, periodoLabel: periodo.label,
      sueldo, comisiones, propinas, bono, extras, total,
      yaPagado: !!yaPago, negocioId: comp.negocio_id, detalleComision,
    })
  }

  const totalPagar = pagos.filter((p) => !p.yaPagado).reduce((s, p) => s + p.total, 0)

  return (
    <div className="px-4 pt-5 pb-24 space-y-4 max-w-3xl mx-auto">
      <Link href="/nomina" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Nómina
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-emerald-400" /> Pagos de nómina
        </h1>
        <p className="text-sm text-zinc-400">Sueldo + comisiones + propinas + extras de cada empleado por periodo.</p>
      </header>

      <section className="card-glow p-4">
        <p className="label-caps">Por pagar este periodo</p>
        <p className="text-3xl font-black tabular-nums text-emerald-300">{totalPagar.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</p>
      </section>

      {/* Atajo a los pagos de la clínica (viven dentro de /clinica → tab Pagos) */}
      <Link
        href="/clinica?tab=pagos"
        className="card flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
          <Stethoscope className="h-5 w-5" />
        </span>
        <div className="flex-1 leading-tight">
          <p className="text-sm font-bold text-white">Pagos de la clínica (Patricia)</p>
          <p className="text-[11px] text-zinc-500">Cortes semanales, reviews y quincena → /clinica</p>
        </div>
        <ChevronRight className="h-4 w-4 text-zinc-400" />
      </Link>

      <div className="space-y-3">
        {pagos.map((p) => (
          <PagoEmpleadoCard key={p.empleadoId} pago={p} cuentas={cuentas ?? []} negocios={negocios ?? []} />
        ))}
      </div>
    </div>
  )
}
