'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'

export type CorteState = { ok?: boolean; error?: string; pagoId?: string; total?: number }

async function getEnfermera() {
  const admin = createAdminClient()
  const { data: cfg } = await admin
    .from('clinica_config_enfermera')
    .select('enfermera_id, nombre, sueldo_base_quincenal')
    .eq('activa', true)
    .limit(1)
    .maybeSingle()
  return cfg
}

async function authUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

function revalidarTodo() {
  revalidatePath('/clinica')
  revalidatePath('/nomina/pagos')
  revalidatePath('/dashboard')
  revalidatePath('/transacciones')
}

// ============================================================
// 1) HACER CORTE — crea snapshot estado='pendiente', NO paga aún
// ============================================================

/** Corte semanal: servicios + propinas (NO reviews — son aparte). */
export async function hacerCorteComisiones(): Promise<CorteState> {
  const user = await authUser()
  if (!user) return { error: 'No autenticado' }
  const cfg = await getEnfermera()
  if (!cfg?.enfermera_id) return { error: 'Falta configurar la enfermera activa' }

  const admin = createAdminClient()
  const { data: pendientes, error: pErr } = await admin
    .from('clinica_realizados')
    .select('id, pago_comision, propina, fecha')
    .eq('enfermera_id', cfg.enfermera_id)
    .neq('tipo', 'review')
    .is('pago_id', null)
  if (pErr) return { error: 'No se pudo leer pendientes: ' + pErr.message }
  if (!pendientes || pendientes.length === 0) return { error: 'No hay servicios sin cortar' }

  const montoComisiones = pendientes.reduce((s, r) => s + Number(r.pago_comision), 0)
  const montoPropinas = pendientes.reduce((s, r) => s + Number(r.propina), 0)
  const total = montoComisiones + montoPropinas
  if (total <= 0) return { error: 'El total del corte es 0' }

  const fechas = pendientes.map((r) => r.fecha).sort()
  const { data: pago, error: pgErr } = await admin
    .from('clinica_pagos')
    .insert({
      enfermera_id: cfg.enfermera_id,
      tipo: 'comisiones',
      periodo_inicio: fechas[0],
      periodo_fin: fechas[fechas.length - 1],
      monto_comisiones: montoComisiones,
      monto_propinas: montoPropinas,
      monto_reviews: 0,
      monto_sueldo_base: 0,
      monto_total: total,
      incluye_reviews: false,
      estado: 'pendiente',
      pagado_por: user.id,
    })
    .select('id')
    .single()
  if (pgErr || !pago) {
    if (/column .*estado.* does not exist/i.test(pgErr?.message ?? '')) {
      return { error: 'Falta correr el ALTER de la columna estado (migración 0032)' }
    }
    return { error: 'No se pudo crear el corte: ' + pgErr?.message }
  }

  await admin
    .from('clinica_realizados')
    .update({ pago_id: pago.id })
    .in('id', pendientes.map((r) => r.id))

  revalidarTodo()
  return { ok: true, pagoId: pago.id, total }
}

/** Corte de reviews — separado, se hace cuando quieras. */
export async function hacerCorteReviews(): Promise<CorteState> {
  const user = await authUser()
  if (!user) return { error: 'No autenticado' }
  const cfg = await getEnfermera()
  if (!cfg?.enfermera_id) return { error: 'Falta configurar la enfermera activa' }

  const admin = createAdminClient()
  const { data: reviews, error: pErr } = await admin
    .from('clinica_realizados')
    .select('id, pago_comision, fecha')
    .eq('enfermera_id', cfg.enfermera_id)
    .eq('tipo', 'review')
    .is('pago_id', null)
  if (pErr) return { error: 'No se pudo leer reviews: ' + pErr.message }
  if (!reviews || reviews.length === 0) return { error: 'No hay reviews sin cortar' }

  const monto = reviews.reduce((s, r) => s + Number(r.pago_comision), 0)
  if (monto <= 0) return { error: 'El total del corte es 0' }

  const fechas = reviews.map((r) => r.fecha).sort()
  const { data: pago, error: pgErr } = await admin
    .from('clinica_pagos')
    .insert({
      enfermera_id: cfg.enfermera_id,
      tipo: 'comisiones',
      periodo_inicio: fechas[0],
      periodo_fin: fechas[fechas.length - 1],
      monto_comisiones: 0,
      monto_propinas: 0,
      monto_reviews: monto,
      monto_sueldo_base: 0,
      monto_total: monto,
      incluye_reviews: true,
      estado: 'pendiente',
      notas: `Corte de ${reviews.length} reviews`,
      pagado_por: user.id,
    })
    .select('id')
    .single()
  if (pgErr || !pago) return { error: 'No se pudo crear el corte: ' + pgErr?.message }

  await admin
    .from('clinica_realizados')
    .update({ pago_id: pago.id })
    .in('id', reviews.map((r) => r.id))

  revalidarTodo()
  return { ok: true, pagoId: pago.id, total: monto }
}

/** Corte de quincena — sueldo base, días 15 y 30. */
export async function hacerCorteQuincena(): Promise<CorteState> {
  const user = await authUser()
  if (!user) return { error: 'No autenticado' }
  const cfg = await getEnfermera()
  if (!cfg?.enfermera_id) return { error: 'Falta configurar la enfermera activa' }
  const sueldo = Number(cfg.sueldo_base_quincenal ?? 0)
  if (sueldo <= 0) return { error: 'Sueldo base es 0 (configura en clinica_config_enfermera)' }

  const hoy = hoyEnCabos()
  const dia = Number(hoy.slice(8, 10))
  const ym = hoy.slice(0, 7)
  const finMes = new Date(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0).getDate()
  const periodoInicio = dia <= 15 ? `${ym}-01` : `${ym}-16`
  const periodoFin = dia <= 15 ? `${ym}-15` : `${ym}-${String(finMes).padStart(2, '0')}`

  const admin = createAdminClient()
  const { data: existente } = await admin
    .from('clinica_pagos')
    .select('id, estado')
    .eq('enfermera_id', cfg.enfermera_id)
    .eq('tipo', 'sueldo_quincenal')
    .eq('periodo_inicio', periodoInicio)
    .in('estado', ['pendiente', 'pagado'])
    .maybeSingle()
  if (existente) {
    return { error: existente.estado === 'pagado' ? 'Esta quincena ya está pagada' : 'Ya hay un corte pendiente de esta quincena' }
  }

  const { data: pago, error: pgErr } = await admin
    .from('clinica_pagos')
    .insert({
      enfermera_id: cfg.enfermera_id,
      tipo: 'sueldo_quincenal',
      periodo_inicio: periodoInicio,
      periodo_fin: periodoFin,
      monto_comisiones: 0,
      monto_propinas: 0,
      monto_reviews: 0,
      monto_sueldo_base: sueldo,
      monto_total: sueldo,
      incluye_reviews: false,
      estado: 'pendiente',
      pagado_por: user.id,
    })
    .select('id')
    .single()
  if (pgErr || !pago) return { error: 'No se pudo crear el corte: ' + pgErr?.message }

  revalidarTodo()
  return { ok: true, pagoId: pago.id, total: sueldo }
}

// ============================================================
// 2) MARCAR PAGADO — convierte pendiente → pagado, genera el gasto
// ============================================================

export async function marcarCortePagado(payload: {
  pagoId: string
  cuentaId?: string | null
  notas?: string | null
}): Promise<CorteState> {
  const user = await authUser()
  if (!user) return { error: 'No autenticado' }
  const admin = createAdminClient()

  const { data: pago, error: pErr } = await admin
    .from('clinica_pagos')
    .select('*')
    .eq('id', payload.pagoId)
    .single()
  if (pErr || !pago) return { error: 'Corte no encontrado' }
  if (pago.estado !== 'pendiente') return { error: `Este corte ya está ${pago.estado}` }

  const cfg = await getEnfermera()
  const nombre = cfg?.nombre ?? 'Patricia'

  // Concepto descriptivo
  let concepto = ''
  if (pago.tipo === 'sueldo_quincenal') {
    concepto = `Sueldo ${nombre} — quincena ${pago.periodo_inicio.slice(8, 10)}-${pago.periodo_fin.slice(8, 10)} ${pago.periodo_inicio.slice(0, 7)}`
  } else if (Number(pago.monto_reviews) > 0 && Number(pago.monto_comisiones) === 0) {
    concepto = `Pago ${nombre} — reviews (${pago.periodo_inicio} a ${pago.periodo_fin})`
  } else {
    concepto = `Pago ${nombre} — comisiones (${pago.periodo_inicio} a ${pago.periodo_fin})`
  }

  // Crear gasto
  const { data: tx, error: txErr } = await admin
    .from('transacciones')
    .insert({
      tipo: 'gasto',
      monto: pago.monto_total,
      moneda: 'MXN',
      monto_mxn_equivalente: pago.monto_total,
      fecha: hoyEnCabos(),
      concepto,
      categoria: 'nomina',
      metodo_captura: 'manual',
      metodo_pago: payload.cuentaId ? 'transferencia_bancaria' : 'otro',
      cuenta_id: payload.cuentaId ?? null,
      capturado_por: user.id,
    })
    .select('id')
    .single()
  if (txErr) return { error: 'No se pudo crear el gasto: ' + txErr.message }

  // Marcar corte como pagado
  const { error: updErr } = await admin
    .from('clinica_pagos')
    .update({
      estado: 'pagado',
      transaccion_id: tx?.id ?? null,
      notas: payload.notas ?? pago.notas,
    })
    .eq('id', payload.pagoId)
  if (updErr) return { error: 'No se pudo marcar el corte: ' + updErr.message }

  // Marcar realizados como pagados (timestamp)
  await admin
    .from('clinica_realizados')
    .update({ pagado_at: new Date().toISOString() })
    .eq('pago_id', payload.pagoId)

  revalidarTodo()
  return { ok: true, total: Number(pago.monto_total) }
}

// ============================================================
// 3) CANCELAR CORTE — revierte un pendiente (estado=cancelado)
// ============================================================

export async function cancelarCorte(pagoId: string): Promise<CorteState> {
  const user = await authUser()
  if (!user) return { error: 'No autenticado' }
  const admin = createAdminClient()

  const { data: pago } = await admin.from('clinica_pagos').select('estado').eq('id', pagoId).single()
  if (!pago) return { error: 'Corte no encontrado' }
  if (pago.estado !== 'pendiente') return { error: `Solo se pueden cancelar cortes pendientes (este está ${pago.estado})` }

  // Liberar los realizados asociados
  await admin.from('clinica_realizados').update({ pago_id: null }).eq('pago_id', pagoId)

  // Marcar el corte cancelado
  const { error } = await admin
    .from('clinica_pagos')
    .update({ estado: 'cancelado', notas: `Cancelado por ${user.id} el ${new Date().toISOString()}` })
    .eq('id', pagoId)
  if (error) return { error: 'No se pudo cancelar: ' + error.message }

  revalidarTodo()
  return { ok: true }
}
