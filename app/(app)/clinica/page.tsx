import { Stethoscope } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hoyEnCabos } from '@/lib/fechas'
import { EmptyState } from '@/components/ui/empty-state'
import { ClinicaClient, type Servicio, type Realizado, type Tabulador } from '@/components/clinica/clinica-client'
import type { ClinicaPagoData, CorteRow, PendienteAprobar } from '@/components/clinica/clinica-pago-card'

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

  // El tablero muestra realizados APROBADOS con CUALQUIER parte sin cortar
  // (comisión sin cortar O propina sin cortar). Pendientes de aprobar aparte.
  const [servRes, realRes, cfgRes, fxRes, pendAprRes] = await Promise.all([
    admin.from('clinica_servicios').select('*').eq('activo', true).order('orden'),
    admin.from('clinica_realizados').select('*')
      .eq('estado_aprobacion', 'aprobado')
      .or('pago_id.is.null,propina_pago_id.is.null')
      .order('fecha', { ascending: false }),
    admin.from('clinica_config_enfermera').select('*').eq('activa', true).limit(1).maybeSingle(),
    admin.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
    admin.from('clinica_realizados').select('id, tipo, servicio_nombre, fecha, pago_comision, propina, foto_url, enfermera_id, notas')
      .eq('estado_aprobacion', 'pendiente')
      .order('created_at', { ascending: false }),
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

  // Separar por tipo + por estado de corte (pago_id para comisión/review; propina_pago_id para propina)
  const reviewsUncut = realizados.filter((r) => r.tipo === 'review' && r.pago_id == null)
  const serviciosUncut = realizados.filter((r) => r.tipo !== 'review' && r.pago_id == null)
  const propinasUncutRows = realizados.filter((r) => r.propina_pago_id == null && Number(r.propina) > 0)

  // Tabulador: lo PENDIENTE de cortar (de cada tipo)
  const comisiones = serviciosUncut.reduce((s, r) => s + Number(r.pago_comision), 0)
  const propinas = propinasUncutRows.reduce((s, r) => s + Number(r.propina), 0)
  const bono = reviewsUncut.reduce((s, r) => s + Number(r.pago_comision), 0)
  const reviews = reviewsUncut.length

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

    // Agrupar lo no cortado por semana (dom–sáb). Las semanas son los ciclos de corte.
    const semanasMap = new Map<string, { inicio: string; fin: string; comisiones: number; serviciosCount: number; propinas: number; propinasCount: number }>()
    function semanaDe(fechaStr: string): { inicio: string; fin: string } {
      const d = new Date(fechaStr + 'T12:00:00')
      const dow = d.getDay() // 0=domingo
      const ini = new Date(d); ini.setDate(d.getDate() - dow)
      const fin = new Date(d); fin.setDate(d.getDate() + (6 - dow))
      return { inicio: ini.toISOString().slice(0, 10), fin: fin.toISOString().slice(0, 10) }
    }
    for (const r of serviciosUncut) {
      const { inicio, fin } = semanaDe(r.fecha)
      const cur = semanasMap.get(inicio) ?? { inicio, fin, comisiones: 0, serviciosCount: 0, propinas: 0, propinasCount: 0 }
      cur.comisiones += Number(r.pago_comision)
      cur.serviciosCount += 1
      semanasMap.set(inicio, cur)
    }
    for (const r of propinasUncutRows) {
      const { inicio, fin } = semanaDe(r.fecha)
      const cur = semanasMap.get(inicio) ?? { inicio, fin, comisiones: 0, serviciosCount: 0, propinas: 0, propinasCount: 0 }
      cur.propinas += Number(r.propina)
      cur.propinasCount += 1
      semanasMap.set(inicio, cur)
    }
    const semanas = Array.from(semanasMap.values()).sort((a, b) => a.inicio.localeCompare(b.inicio))

    // realRes ya está filtrado a aprobado + alguna parte sin cortar;
    // ahora separamos por componente (comisión, propina, review).
    pagosData = {
      nombre: cfgRes.data.nombre ?? 'Patricia',
      enCurso: {
        semanas,
        reviewsCount: reviewsUncut.length,
        reviewsMonto: bono,
      },
      quincena: {
        label: quincenaLabel,
        monto: Number(cfgRes.data.sueldo_base_quincenal ?? 0),
        estado: quincenaActualEstado,
      },
      pendientes: (pendientesRes.data ?? []).map(mapCorte),
      historial: (historialRes.data ?? []).map(mapCorte),
      pendientesAprobar: [],
    }

    // Pendientes de aprobar: con foto firmada
    const pendAprRows = pendAprRes.data ?? []
    const pendientesAprobar: PendienteAprobar[] = []
    for (const p of pendAprRows) {
      let fotoUrl: string | null = null
      if (p.foto_url) {
        const { data: signed } = await admin.storage.from('recibos').createSignedUrl(p.foto_url, 60 * 60 * 8)
        fotoUrl = signed?.signedUrl ?? null
      }
      pendientesAprobar.push({
        id: p.id,
        tipo: (p.tipo === 'review' ? 'review' : 'servicio'),
        servicio_nombre: p.servicio_nombre,
        fecha: p.fecha,
        pago_comision: Number(p.pago_comision),
        propina: Number(p.propina),
        foto_url: fotoUrl,
        notas: p.notas,
      })
    }
    pagosData.pendientesAprobar = pendientesAprobar
  }
  // Sueldo: muestra siempre el monto config; solo se excluye del TOTAL si ya está pagado
  const sueldoConfig = Number(cfg?.sueldo_base_quincenal ?? 0)
  const sueldoBase = quincenaActualEstado === 'pagado' ? 0 : sueldoConfig
  const sueldoEstadoLabel =
    quincenaActualEstado === 'pagado' ? '✓ pagada este periodo'
      : quincenaActualEstado === 'pendiente' ? '⏳ corte hecho · esperando pago'
      : 'sin cortar'
  const total = comisiones + propinas + bono + sueldoBase

  const periodo = quincenaActualEstado === 'pagado' && realizados.length === 0
    ? `Al corriente ✓ (${quincenaLabel})`
    : `Pendiente · ${quincenaLabel}`

  const tabulador: Tabulador = {
    periodo, comisiones, propinas, bono, sueldoBase, sueldoEstadoLabel, total,
    numServicios: serviciosUncut.length, reviews,
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
