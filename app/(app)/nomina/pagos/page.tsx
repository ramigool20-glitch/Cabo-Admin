import Link from 'next/link'
import { ChevronLeft, DollarSign } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { periodoActual } from '@/lib/nomina-calculo'
import { PagoEmpleadoCard, type PagoEmpleado } from '@/components/nomina/pago-empleado-card'
import { ClinicaPagoCard, type ClinicaPagoData } from '@/components/clinica/clinica-pago-card'
import { hoyEnCabos } from '@/lib/fechas'

export default async function NominaPagosPage() {
  const admin = createAdminClient()

  const [{ data: empleados }, { data: cuentas }, { data: negocios }, { data: cfgEnf }] = await Promise.all([
    admin.from('empleados')
      .select('id, nombre, puesto, empleado_compensacion(sueldo_base, moneda, comision_porcentaje, comision_base, frecuencia_pago, negocio_id, activo)')
      .eq('activo', true).order('nombre'),
    admin.from('cuentas').select('id, nombre').eq('activo', true).order('nombre'),
    admin.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
    admin.from('clinica_config_enfermera').select('*').eq('activa', true).maybeSingle(),
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

  // === Datos para la tarjeta de Patricia (clínica) ===
  let clinicaData: ClinicaPagoData | null = null
  const enfermeraId = cfgEnf?.enfermera_id
  const nombreEnfermera = cfgEnf?.nombre ?? 'Patricia'
  if (enfermeraId) {
    const hoyStr = hoyEnCabos()
    const dia = Number(hoyStr.slice(8, 10))
    const ym = hoyStr.slice(0, 7)
    const finMes = new Date(Number(hoyStr.slice(0, 4)), Number(hoyStr.slice(5, 7)), 0).getDate()
    const periodoInicio = dia <= 15 ? `${ym}-01` : `${ym}-16`
    const periodoFin = dia <= 15 ? `${ym}-15` : `${ym}-${String(finMes).padStart(2, '0')}`

    const [pendRes, pagoSueldoRes, histRes] = await Promise.all([
      admin.from('clinica_realizados')
        .select('id, tipo, pago_comision, propina, pagado_at')
        .eq('enfermera_id', enfermeraId)
        .is('pagado_at', null),
      admin.from('clinica_pagos')
        .select('id, created_at')
        .eq('enfermera_id', enfermeraId)
        .eq('tipo', 'sueldo_quincenal')
        .eq('periodo_inicio', periodoInicio)
        .maybeSingle(),
      admin.from('clinica_pagos')
        .select('id, tipo, monto_total, periodo_inicio, periodo_fin, created_at')
        .eq('enfermera_id', enfermeraId)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const pendientes = (pendRes.data ?? []) as Array<{ id: string; tipo: string | null; pago_comision: number; propina: number }>
    const servicios = pendientes.filter((r) => r.tipo !== 'review')
    const reviews = pendientes.filter((r) => r.tipo === 'review')

    clinicaData = {
      nombre: nombreEnfermera,
      comisiones: servicios.reduce((s, r) => s + Number(r.pago_comision), 0),
      propinas: servicios.reduce((s, r) => s + Number(r.propina), 0),
      serviciosCount: servicios.length,
      reviewsMonto: reviews.reduce((s, r) => s + Number(r.pago_comision), 0),
      reviewsCount: reviews.length,
      sueldoQuincenalMonto: Number(cfgEnf?.sueldo_base_quincenal ?? 0),
      sueldoQuincenaLabel: dia <= 15 ? `1-15 ${ym}` : `16-${finMes} ${ym}`,
      sueldoQuincenaPagado: !!pagoSueldoRes.data,
      sueldoQuincenaPagadoAt: pagoSueldoRes.data?.created_at ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      historial: (histRes.data ?? []) as any,
    }
  }

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

      <div className="space-y-3">
        {clinicaData && (
          <ClinicaPagoCard data={clinicaData} cuentas={cuentas ?? []} />
        )}
        {pagos.map((p) => (
          <PagoEmpleadoCard key={p.empleadoId} pago={p} cuentas={cuentas ?? []} negocios={negocios ?? []} />
        ))}
      </div>
    </div>
  )
}
