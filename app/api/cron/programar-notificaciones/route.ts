import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { hoyEnCabos, TZ } from '@/lib/fechas'
import { toZonedTime } from 'date-fns-tz'
import { proximaFechaPagoEmpleado } from '@/lib/proximo-pago'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Idempotente: usa ref_tabla + ref_id + fecha objetivo como llave única lógica.
 * Antes de insertar, checa que no exista una notificación con esos campos para
 * el mismo día.
 */
async function agendar(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    tipo: 'nomina' | 'renta' | 'recurrente'
    titulo: string
    mensaje: string
    fecha_disparo: Date
    destinatarios: string[]
    ref_tabla: string
    ref_id: string
  }
) {
  const fechaISO = args.fecha_disparo.toISOString()
  const dia = fechaISO.slice(0, 10)

  // Dedup: ya existe para este día/ref
  const { data: existente } = await admin
    .from('notificaciones_programadas')
    .select('id')
    .eq('tipo', args.tipo)
    .eq('ref_id', args.ref_id)
    .gte('fecha_disparo', `${dia}T00:00:00Z`)
    .lt('fecha_disparo', `${dia}T23:59:59Z`)
    .maybeSingle()

  if (existente) return false

  const { error } = await admin.from('notificaciones_programadas').insert({
    tipo: args.tipo,
    titulo: args.titulo,
    mensaje: args.mensaje,
    fecha_disparo: fechaISO,
    destinatarios: args.destinatarios,
    ref_tabla: args.ref_tabla,
    ref_id: args.ref_id,
    enviada: false,
  })
  return !error
}

function diasAdelante(dias: number): string {
  const ahora = toZonedTime(new Date(), TZ)
  const objetivo = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + dias)
  return objetivo.toISOString().slice(0, 10)
}


export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const hoy = hoyEnCabos()
  const en1Dia = diasAdelante(1)
  const en2Dias = diasAdelante(2)

  let totalNomina = 0
  let totalRecurrente = 0

  // ====== NÓMINAS ======
  // Para cada empleado_compensacion activa, calcular su próxima fecha según frecuencia.
  const { data: comps } = await admin
    .from('empleado_compensacion')
    .select('id, empleado_id, negocio_id, sueldo_base, dia_de_pago, frecuencia_pago, moneda, empleados(nombre), negocios(nombre)')
    .eq('activo', true)

  // Conseguir todos los profile_ids con rol admin/socio para los destinatarios
  const { data: socios } = await admin
    .from('profiles')
    .select('id, role_id, roles(nombre)')
    .eq('activo', true)
  const destinatarios = (socios ?? [])
    .filter((p) => {
      const r = (p.roles as unknown as { nombre: string } | null)
      return r?.nombre === 'admin' || r?.nombre === 'socio'
    })
    .map((p) => p.id)

  if (destinatarios.length > 0) {
    for (const c of comps ?? []) {
      const frecuencia = c.frecuencia_pago as 'mensual' | 'quincenal' | 'semanal'
      const dia = c.dia_de_pago ? Number(c.dia_de_pago) : null
      const proximaPago = proximaFechaPagoEmpleado(frecuencia, dia)

      // Agendar push si el próximo pago es mañana
      if (proximaPago !== en1Dia) continue

      const emp = c.empleados as unknown as { nombre: string } | null
      const neg = c.negocios as unknown as { nombre: string } | null
      const moneda = c.moneda || 'MXN'
      const disparo = new Date()
      disparo.setHours(disparo.getHours() + 1)

      const creado = await agendar(admin, {
        tipo: 'nomina',
        titulo: `💵 Mañana toca pagar: ${emp?.nombre ?? 'empleado'}`,
        mensaje: `${moneda} ${Number(c.sueldo_base).toLocaleString()} · ${neg?.nombre ?? ''} · ${frecuencia}`,
        fecha_disparo: disparo,
        destinatarios,
        ref_tabla: 'empleado_compensacion',
        ref_id: c.id,
      })
      if (creado) totalNomina++
    }
  }

  // ====== RECURRENTES ======
  // Para cada recurrente activo con próximo_pago en 2 días (renta) o 1 día (otros), agendar.
  const { data: recs } = await admin
    .from('gastos_recurrentes')
    .select('id, nombre, categoria, monto, moneda, proximo_pago, responsable_id, negocios(nombre)')
    .eq('activo', true)
    .gte('proximo_pago', hoy)

  if (destinatarios.length > 0) {
    for (const r of recs ?? []) {
      const dias = r.categoria === 'renta' ? en2Dias : en1Dia
      if (r.proximo_pago !== dias) continue

      const neg = r.negocios as unknown as { nombre: string } | null
      const disparo = new Date()
      disparo.setHours(disparo.getHours() + 1)

      const targets = r.responsable_id ? [r.responsable_id, ...destinatarios.filter((d) => d !== r.responsable_id)] : destinatarios

      const creado = await agendar(admin, {
        tipo: r.categoria === 'renta' ? 'renta' : 'recurrente',
        titulo: r.categoria === 'renta'
          ? `Renta en 2 días: ${r.nombre}`
          : `Pago en 1 día: ${r.nombre}`,
        mensaje: `${Number(r.monto).toLocaleString()} ${r.moneda}${neg?.nombre ? ' · ' + neg.nombre : ''}.`,
        fecha_disparo: disparo,
        destinatarios: targets,
        ref_tabla: 'gastos_recurrentes',
        ref_id: r.id,
      })
      if (creado) totalRecurrente++
    }
  }

  return NextResponse.json({
    ok: true,
    hoy,
    nominas_agendadas: totalNomina,
    recurrentes_agendados: totalRecurrente,
  })
}
