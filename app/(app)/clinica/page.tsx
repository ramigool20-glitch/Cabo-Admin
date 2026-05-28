import { Stethoscope } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'
import { EmptyState } from '@/components/ui/empty-state'
import { ClinicaClient, type Servicio, type Realizado, type Tabulador } from '@/components/clinica/clinica-client'

export default async function ClinicaPage() {
  const admin = createAdminClient()
  const hoy = hoyEnCabos()

  // Quincena actual: 1-15 o 16-fin de mes
  const dia = Number(hoy.slice(8, 10))
  const ym = hoy.slice(0, 7)
  const finMes = new Date(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0).getDate()
  const desde = dia <= 15 ? `${ym}-01` : `${ym}-16`
  const hasta = dia <= 15 ? `${ym}-15` : `${ym}-${String(finMes).padStart(2, '0')}`
  const periodo = dia <= 15 ? `1-15 ${ym}` : `16-${finMes} ${ym}`

  const [servRes, realRes, cfgRes, fxRes] = await Promise.all([
    admin.from('clinica_servicios').select('*').eq('activo', true).order('orden'),
    admin.from('clinica_realizados').select('*').gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }),
    admin.from('clinica_config_enfermera').select('*').eq('activa', true).limit(1).maybeSingle(),
    admin.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
  ])
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

  // Tabulador
  const comisiones = realizados.reduce((s, r) => s + Number(r.pago_comision), 0)
  const propinas = realizados.reduce((s, r) => s + Number(r.propina), 0)
  const reviews = cfg?.reviews_acumuladas ?? 0
  const bonoPorReview = cfg?.bono_por_review ?? 50
  const bono = reviews * bonoPorReview
  const sueldoBase = cfg?.sueldo_base_quincenal ?? 0
  const total = comisiones + propinas + bono + sueldoBase

  const tabulador: Tabulador = {
    periodo, comisiones, propinas, bono, sueldoBase, total,
    numServicios: realizados.length, reviews,
  }

  return (
    <div className="px-4 pt-5 pb-24 space-y-4 max-w-3xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-cyan-400" />
          Cabo Walk-in Clinic
        </h1>
        <p className="text-sm text-zinc-400">
          Catálogo bilingüe, registro de servicios y tabulador de comisiones de la enfermera.
        </p>
      </header>

      <ClinicaClient servicios={servicios} realizados={realizados} tabulador={tabulador} fxRate={fxRate} />
    </div>
  )
}
