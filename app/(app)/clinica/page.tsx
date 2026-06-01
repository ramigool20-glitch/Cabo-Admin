import { Stethoscope } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hoyEnCabos } from '@/lib/fechas'
import { EmptyState } from '@/components/ui/empty-state'
import { ClinicaClient, type Servicio, type Realizado, type Tabulador } from '@/components/clinica/clinica-client'
import type { ClinicaPagoData, CorteRow } from '@/components/clinica/clinica-pago-card'

type SearchParams = { tab?: string }

export default async function ClinicaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await searchParams // la pestaña activa la lee el cliente desde la URL
  const admin = createAdminClient()
  const hoy = hoyEnCabos()

  // ¿Quién entra? Si es enfermera, ocultamos las pestañas superiores (usa su menú inferior)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let esEnfermera = false
  if (user) {
    const { data: prof } = await admin.from('profiles').select('role_id').eq('id', user.id).single()
    if (prof?.role_id) {
      const { data: roleRow } = await admin.from('roles').select('nombre').eq('id', prof.role_id).single()
      esEnfermera = roleRow?.nombre === 'enfermera'
    }
  }

  // Quincena actual: 1-15 o 16-fin de mes (solo para etiqueta del sueldo)
  const dia = Number(hoy.slice(8, 10))
  const ym = hoy.slice(0, 7)
  const finMes = new Date(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0).getDate()
  const quincenaInicio = dia <= 15 ? `${ym}-01` : `${ym}-16`
  const quincenaLabel = dia <= 15 ? `1-15 ${ym}` : `16-${finMes} ${ym}`

  // El tablero muestra solo lo EN CURSO (no cortado). Al hacer corte, esos
  // realizados se asocian al corte (pago_id) y desaparecen de aquí.
  const [servRes, realRes, cfgRes, fxRes] = await Promise.all([
    admin.from('clinica_servicios').select('*').eq('activo', true).order('orden'),
    admin.from('clinica_realizados').select('*').is('pago_id', null).order('fecha', { ascending: false }),
    admin.from('clinica_config_enfermera').select('*').eq('activa', true).limit(1).maybeSingle(),
    admin.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
  ])

  // ¿Sueldo de la quincena actual ya cortado (pendiente o pagado)?
  let sueldoQuincenaCortado = false
  let quincenaActualEstado: 'sin_corte' | 'pendiente' | 'pagado' = 'sin_corte'
  if (cfgRes.data?.enfermera_id) {
    const { data: pagoSueldo } = await admin
      .from('clinica_pagos')
      .select('id, estado')
      .eq('enfermera_id', cfgRes.data.enfermera_id)
      .eq('tipo', 'sueldo_quincenal')
      .eq('periodo_inicio', quincenaInicio)
      .in('estado', ['pendiente', 'pagado'])
      .maybeSingle()
    sueldoQuincenaCortado = !!pagoSueldo
    quincenaActualEstado = pagoSueldo?.estado === 'pagado' ? 'pagado'
      : pagoSueldo?.estado === 'pendiente' ? 'pendiente'
      : 'sin_corte'
  }
  const fxRate = fxRes.data ? Number(fxRes.data.rate_compra) : 17

  // === Datos del admin: cortes pendientes + histórico + cuentas (no enfermera) ===
  let pagosData: ClinicaPagoData | null = null
  let cuentasAdmin: Array<{ id: string; nombre: string }> = []
  if (!esEnfermera && cfgRes.data?.enfermera_id) {
    const [cuentasRes, pendientesRes, historialRes] = await Promise.all([
      admin.from('cuentas').select('id, nombre').eq('activo', true).order('nombre'),
      admin.from('clinica_pagos')
        .select('id, tipo, monto_total, monto_comisiones, monto_propinas, monto_reviews, monto_sueldo_base, periodo_inicio, periodo_fin, created_at')
        .eq('enfermera_id', cfgRes.data.enfermera_id)
        .eq('estado', 'pendiente')
        .order('created_at', { ascending: false }),
      admin.from('clinica_pagos')
        .select('id, tipo, monto_total, monto_comisiones, monto_reviews, periodo_inicio, periodo_fin, created_at')
        .eq('enfermera_id', cfgRes.data.enfermera_id)
        .eq('estado', 'pagado')
        .order('created_at', { ascending: false })
        .limit(10),
    ])
    cuentasAdmin = cuentasRes.data ?? []

    function tipoVisual(p: { tipo: string; monto_comisiones?: number | string | null; monto_reviews?: number | string | null }): CorteRow['tipo_visual'] {
      if (p.tipo === 'sueldo_quincenal') return 'sueldo_quincenal'
      if (Number(p.monto_reviews ?? 0) > 0 && Number(p.monto_comisiones ?? 0) === 0) return 'reviews'
      return 'comisiones'
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapCorte = (p: any): CorteRow => ({
      id: p.id, tipo_visual: tipoVisual(p),
      periodo_inicio: p.periodo_inicio, periodo_fin: p.periodo_fin,
      monto_total: Number(p.monto_total), created_at: p.created_at,
    })

    // realRes contiene los EN CURSO (pago_id IS NULL); reuse para el split
    const enCursoRows = (realRes.data ?? []) as unknown as Array<{ tipo?: string | null; pago_comision: number; propina: number }>
    const enCursoServ = enCursoRows.filter((r) => r.tipo !== 'review')
    const enCursoRev = enCursoRows.filter((r) => r.tipo === 'review')

    pagosData = {
      nombre: cfgRes.data.nombre ?? 'Patricia',
      enCurso: {
        serviciosCount: enCursoServ.length,
        comisiones: enCursoServ.reduce((s, r) => s + Number(r.pago_comision), 0),
        propinas: enCursoServ.reduce((s, r) => s + Number(r.propina), 0),
        reviewsCount: enCursoRev.length,
        reviewsMonto: enCursoRev.reduce((s, r) => s + Number(r.pago_comision), 0),
      },
      quincena: {
        label: quincenaLabel,
        monto: Number(cfgRes.data.sueldo_base_quincenal ?? 0),
        estado: quincenaActualEstado,
      },
      pendientes: (pendientesRes.data ?? []).map(mapCorte),
      historial: (historialRes.data ?? []).map(mapCorte),
    }
  }

  // Si las tablas no existen aún
  if (servRes.error && /relation.*does not exist/i.test(servRes.error.message)) {
    return (
      <div className="px-4 pt-5 pb-24 max-w-3xl mx-auto">
        <EmptyState
          emoji="🏥"
          title="Falta activar el módulo Clínica"
          description="Pega la migración 0025_clinica.sql en Supabase para crear el catálogo y el tabulador."
        />
      </div>
    )
  }

  const servicios = (servRes.data ?? []) as unknown as Servicio[]
  const realizados = (realRes.data ?? []) as unknown as Realizado[]
  const cfg = cfgRes.data

  // Separar servicios vs reseñas (tipo puede no existir aún → cuenta como servicio)
  const reviewsRealizados = realizados.filter((r) => r.tipo === 'review')
  const serviciosRealizados = realizados.filter((r) => r.tipo !== 'review')

  // Tabulador: lo PENDIENTE de cobrar
  const comisiones = serviciosRealizados.reduce((s, r) => s + Number(r.pago_comision), 0)
  const propinas = realizados.reduce((s, r) => s + Number(r.propina), 0)
  const bono = reviewsRealizados.reduce((s, r) => s + Number(r.pago_comision), 0)
  const reviews = reviewsRealizados.length
  // Sueldo solo si la quincena actual NO tiene corte ya creado
  const sueldoBase = sueldoQuincenaCortado ? 0 : (cfg?.sueldo_base_quincenal ?? 0)
  const total = comisiones + propinas + bono + sueldoBase

  const periodo = sueldoQuincenaCortado && realizados.length === 0
    ? `Al corriente ✓ (${quincenaLabel})`
    : `Pendiente de cortar · ${quincenaLabel}`

  const tabulador: Tabulador = {
    periodo, comisiones, propinas, bono, sueldoBase, total,
    numServicios: serviciosRealizados.length, reviews,
  }

  return (
    <div className="px-4 pt-5 pb-24 space-y-4 max-w-3xl mx-auto">
      {!esEnfermera && (
        <header className="space-y-1">
          <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-cyan-400" />
            Cabo Walk-in Clinic
          </h1>
          <p className="text-sm text-zinc-400">
            Catálogo bilingüe, registro de servicios y tabulador de comisiones de la enfermera.
          </p>
        </header>
      )}

      <ClinicaClient
        servicios={servicios}
        realizados={realizados}
        tabulador={tabulador}
        fxRate={fxRate}
        esEnfermera={esEnfermera}
        pagosData={pagosData}
        cuentas={cuentasAdmin}
      />
    </div>
  )
}
