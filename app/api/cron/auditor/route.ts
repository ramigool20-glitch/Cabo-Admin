import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { hoyEnCabos, TZ } from '@/lib/fechas'
import { toZonedTime } from 'date-fns-tz'

export const runtime = 'nodejs'
export const maxDuration = 60

type Pendiente = {
  pregunta: string
  contexto: string
  prioridad: 'alta' | 'media' | 'baja'
  dirigida_a: string
}

async function yaExiste(
  admin: ReturnType<typeof createAdminClient>,
  pregunta: string
): Promise<boolean> {
  const { data } = await admin
    .from('auditor_pendientes')
    .select('id')
    .eq('estado', 'abierta')
    .ilike('pregunta', pregunta.slice(0, 50) + '%')
    .maybeSingle()
  return !!data
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const hoy = hoyEnCabos()
  const hace7d = new Date()
  hace7d.setDate(hace7d.getDate() - 7)
  const hace7dISO = hace7d.toISOString().slice(0, 10)

  // Conseguir socios
  const { data: socios } = await admin
    .from('profiles')
    .select('id, nombre, role_id, roles(nombre)')
    .eq('activo', true)
  const sociosActivos = (socios ?? []).filter((p) => {
    const r = p.roles as unknown as { nombre: string } | null
    return r?.nombre === 'admin' || r?.nombre === 'socio'
  })
  if (sociosActivos.length === 0) return NextResponse.json({ ok: true, pendientes: 0 })

  const pendientes: Pendiente[] = []
  const targetSocio = sociosActivos[0].id // primer socio por default

  // ============================================================
  // 1) Cortes diarios faltantes (farmacia + consultorio)
  // ============================================================
  const { data: negociosCorte } = await admin
    .from('negocios')
    .select('id, nombre, tipo')
    .eq('activo', true)
    .in('tipo', ['farmacia', 'consultorio'])

  for (const neg of negociosCorte ?? []) {
    const { data: corte } = await admin
      .from('cortes_diarios')
      .select('id')
      .eq('negocio_id', neg.id)
      .eq('fecha', hoy)
      .maybeSingle()
    if (!corte) {
      pendientes.push({
        pregunta: `¿Ya tienes el corte de ${neg.nombre} de hoy?`,
        contexto: `No hay corte_diario registrado para ${neg.nombre} con fecha ${hoy}.`,
        prioridad: 'alta',
        dirigida_a: targetSocio,
      })
    }
  }

  // ============================================================
  // 2) Páginas digitales con gastos de ads pero sin ventas
  // ============================================================
  const { data: paginas } = await admin
    .from('negocios')
    .select('id, nombre')
    .eq('tipo', 'pagina_digital')
    .eq('activo', true)

  for (const p of paginas ?? []) {
    const { data: adsHoy } = await admin
      .from('gastos_ads')
      .select('monto')
      .eq('negocio_id', p.id)
      .eq('fecha', hoy)
    const totalAds = (adsHoy ?? []).reduce((s, x) => s + Number(x.monto), 0)

    if (totalAds > 0) {
      const { data: ventasHoy } = await admin
        .from('ventas')
        .select('id')
        .eq('negocio_id', p.id)
        .eq('fecha', hoy)
      if (!ventasHoy || ventasHoy.length === 0) {
        pendientes.push({
          pregunta: `${p.nombre} gastó $${totalAds.toFixed(0)} en ads hoy pero no registró ventas. ¿Se te pasó capturar o realmente no hubo?`,
          contexto: `gastos_ads=${totalAds}, ventas=0 para ${hoy}`,
          prioridad: 'alta',
          dirigida_a: targetSocio,
        })
      }
    }
  }

  // ============================================================
  // 3) Empleados sin compensación configurada
  // ============================================================
  const { data: empleados } = await admin
    .from('empleados')
    .select('id, nombre, empleado_compensacion(id, activo)')
    .eq('activo', true)

  for (const e of empleados ?? []) {
    const comps = (e.empleado_compensacion as Array<{ activo: boolean }> | null) ?? []
    if (comps.filter((c) => c.activo).length === 0) {
      pendientes.push({
        pregunta: `${e.nombre} no tiene compensación configurada. ¿Cuánto gana de sueldo base y/o comisión y en qué negocio?`,
        contexto: `empleado_id sin compensaciones activas`,
        prioridad: 'media',
        dirigida_a: targetSocio,
      })
    }
  }

  // ============================================================
  // 4) Transacciones sin categoría en los últimos 7 días
  // ============================================================
  const { data: txSinCat } = await admin
    .from('transacciones')
    .select('id, concepto, monto, moneda, fecha')
    .gte('fecha', hace7dISO)
    .or('categoria.is.null,categoria.eq.')
    .limit(20)

  if ((txSinCat ?? []).length >= 5) {
    pendientes.push({
      pregunta: `Hay ${txSinCat?.length ?? 0} transacciones sin categoría en los últimos 7 días. ¿Quieres que las repasemos?`,
      contexto: 'transacciones.categoria IS NULL en últimos 7 días',
      prioridad: 'media',
      dirigida_a: targetSocio,
    })
  }

  // ============================================================
  // 5) Negocios sin movimiento en 7+ días (excepto general)
  // ============================================================
  const { data: todosNegocios } = await admin
    .from('negocios')
    .select('id, nombre, tipo')
    .eq('activo', true)
    .neq('tipo', 'general')

  for (const n of todosNegocios ?? []) {
    const { count } = await admin
      .from('transacciones')
      .select('id', { count: 'exact', head: true })
      .eq('negocio_id', n.id)
      .gte('fecha', hace7dISO)
    if ((count ?? 0) === 0) {
      pendientes.push({
        pregunta: `${n.nombre} no ha tenido ningún movimiento en los últimos 7 días. ¿Está pausado o se te pasó capturar?`,
        contexto: `Sin transacciones desde ${hace7dISO}`,
        prioridad: 'baja',
        dirigida_a: targetSocio,
      })
    }
  }

  // ============================================================
  // Insertar pendientes (deduplicados)
  // ============================================================
  let creados = 0
  for (const p of pendientes) {
    const existe = await yaExiste(admin, p.pregunta)
    if (existe) continue
    const { error } = await admin.from('auditor_pendientes').insert({
      pregunta: p.pregunta,
      contexto: p.contexto,
      prioridad: p.prioridad,
      dirigida_a: p.dirigida_a,
      estado: 'abierta',
    })
    if (!error) creados++
  }

  // ============================================================
  // Programar notificaciones push de los pendientes de alta
  // ============================================================
  const altaPrioridad = pendientes.filter((p) => p.prioridad === 'alta')
  if (altaPrioridad.length > 0) {
    const ahora = toZonedTime(new Date(), TZ)
    // Disparar en 1 hora
    const disparo = new Date(ahora.getTime() + 60 * 60 * 1000)

    await admin.from('notificaciones_programadas').insert({
      tipo: 'auditor',
      titulo: `🔍 Auditor detectó ${altaPrioridad.length} pendiente${altaPrioridad.length > 1 ? 's' : ''} urgente${altaPrioridad.length > 1 ? 's' : ''}`,
      mensaje: altaPrioridad[0].pregunta.slice(0, 100),
      fecha_disparo: disparo.toISOString(),
      destinatarios: sociosActivos.map((s) => s.id),
      ref_tabla: 'auditor_pendientes',
      enviada: false,
    })
  }

  return NextResponse.json({
    ok: true,
    pendientes_creados: creados,
    pendientes_totales_detectados: pendientes.length,
  })
}
