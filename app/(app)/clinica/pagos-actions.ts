'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'

export type PagoState = { ok?: boolean; error?: string; total?: number }

/**
 * Paga comisiones+propinas (+reviews opcional) PENDIENTES de Patricia.
 * Marca los realizados como pagados y crea un gasto en transacciones.
 * Las reviews que NO se incluyen se quedan acumuladas para el siguiente pago.
 */
export async function pagarComisionesEnfermera(payload: {
  incluyeReviews: boolean
  cuentaId?: string | null
  notas?: string | null
}): Promise<PagoState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { data: cfg } = await admin
    .from('clinica_config_enfermera')
    .select('enfermera_id, nombre')
    .eq('activa', true)
    .limit(1)
    .maybeSingle()
  if (!cfg?.enfermera_id) return { error: 'Falta configurar la enfermera activa' }

  // Realizados pendientes de la enfermera
  const { data: pendientes, error: pendErr } = await admin
    .from('clinica_realizados')
    .select('id, tipo, pago_comision, propina, fecha')
    .eq('enfermera_id', cfg.enfermera_id)
    .is('pagado_at', null)
  if (pendErr) return { error: 'No se pudieron leer los pendientes: ' + pendErr.message }
  if (!pendientes || pendientes.length === 0) return { error: 'No hay nada pendiente de pagar' }

  const servicios = pendientes.filter((r) => r.tipo !== 'review')
  const reviews = pendientes.filter((r) => r.tipo === 'review')
  const aPagar = payload.incluyeReviews ? pendientes : servicios
  if (aPagar.length === 0) return { error: 'Sin comisiones por pagar (solo hay reviews y elegiste no incluirlas)' }

  const montoComisiones = servicios.reduce((s, r) => s + Number(r.pago_comision), 0)
  const montoPropinas = servicios.reduce((s, r) => s + Number(r.propina), 0)
  const montoReviews = payload.incluyeReviews ? reviews.reduce((s, r) => s + Number(r.pago_comision), 0) : 0
  const total = montoComisiones + montoPropinas + montoReviews
  if (total <= 0) return { error: 'El monto a pagar es 0' }

  const fechas = aPagar.map((r) => r.fecha).sort()
  const periodoInicio = fechas[0]
  const periodoFin = fechas[fechas.length - 1]
  const hoy = hoyEnCabos()

  // 1) Insert clinica_pagos
  const { data: pago, error: pagoErr } = await admin.from('clinica_pagos').insert({
    enfermera_id: cfg.enfermera_id,
    tipo: 'comisiones',
    periodo_inicio: periodoInicio,
    periodo_fin: periodoFin,
    monto_comisiones: montoComisiones,
    monto_propinas: montoPropinas,
    monto_reviews: montoReviews,
    monto_sueldo_base: 0,
    monto_total: total,
    incluye_reviews: payload.incluyeReviews,
    notas: payload.notas ?? null,
    pagado_por: user.id,
  }).select('id').single()
  if (pagoErr || !pago) {
    if (/relation .*clinica_pagos.* does not exist/i.test(pagoErr?.message ?? '')) {
      return { error: 'Falta crear la tabla clinica_pagos (migración 0031)' }
    }
    return { error: 'No se pudo registrar el pago: ' + pagoErr?.message }
  }

  // 2) Marcar realizados como pagados
  const ids = aPagar.map((r) => r.id)
  const { error: updErr } = await admin
    .from('clinica_realizados')
    .update({ pagado_at: new Date().toISOString(), pago_id: pago.id })
    .in('id', ids)
  if (updErr) return { error: 'No se pudieron marcar los servicios: ' + updErr.message }

  // 3) Crear gasto en transacciones (categoria nómina)
  const partes: string[] = []
  if (montoComisiones > 0) partes.push(`comisiones ${servicios.length}`)
  if (montoPropinas > 0) partes.push(`propinas`)
  if (montoReviews > 0) partes.push(`${reviews.length} reviews`)
  const concepto = `Pago ${cfg.nombre} — ${partes.join(' + ')}`

  const { data: tx, error: txErr } = await admin.from('transacciones').insert({
    tipo: 'gasto',
    monto: total,
    moneda: 'MXN',
    monto_mxn_equivalente: total,
    fecha: hoy,
    concepto,
    categoria: 'nomina',
    metodo_captura: 'manual',
    metodo_pago: payload.cuentaId ? 'transferencia_bancaria' : 'otro',
    cuenta_id: payload.cuentaId ?? null,
    capturado_por: user.id,
  }).select('id').single()
  if (!txErr && tx?.id) {
    await admin.from('clinica_pagos').update({ transaccion_id: tx.id }).eq('id', pago.id)
  }

  revalidatePath('/clinica')
  revalidatePath('/nomina/pagos')
  revalidatePath('/dashboard')
  revalidatePath('/transacciones')
  return { ok: true, total }
}

/**
 * Paga el sueldo quincenal base de la enfermera (1-15 o 16-fin).
 */
export async function pagarSueldoQuincenaEnfermera(payload: {
  cuentaId?: string | null
  notas?: string | null
}): Promise<PagoState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { data: cfg } = await admin
    .from('clinica_config_enfermera')
    .select('enfermera_id, nombre, sueldo_base_quincenal')
    .eq('activa', true)
    .limit(1)
    .maybeSingle()
  if (!cfg?.enfermera_id) return { error: 'Falta configurar la enfermera activa' }
  const sueldo = Number(cfg.sueldo_base_quincenal ?? 0)
  if (sueldo <= 0) return { error: 'Sueldo base es 0; configúralo en clinica_config_enfermera' }

  const hoy = hoyEnCabos()
  const dia = Number(hoy.slice(8, 10))
  const ym = hoy.slice(0, 7)
  const finMes = new Date(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0).getDate()
  const periodoInicio = dia <= 15 ? `${ym}-01` : `${ym}-16`
  const periodoFin = dia <= 15 ? `${ym}-15` : `${ym}-${String(finMes).padStart(2, '0')}`

  // ¿Ya pagada esta quincena?
  const { data: ya } = await admin
    .from('clinica_pagos')
    .select('id')
    .eq('enfermera_id', cfg.enfermera_id)
    .eq('tipo', 'sueldo_quincenal')
    .eq('periodo_inicio', periodoInicio)
    .maybeSingle()
  if (ya?.id) return { error: 'Esta quincena ya está pagada' }

  const { data: pago, error: pagoErr } = await admin.from('clinica_pagos').insert({
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
    notas: payload.notas ?? null,
    pagado_por: user.id,
  }).select('id').single()
  if (pagoErr || !pago) {
    if (/relation .*clinica_pagos.* does not exist/i.test(pagoErr?.message ?? '')) {
      return { error: 'Falta crear la tabla clinica_pagos (migración 0031)' }
    }
    return { error: 'No se pudo registrar: ' + pagoErr?.message }
  }

  const concepto = `Sueldo ${cfg.nombre} — quincena ${periodoInicio.slice(8, 10)}-${periodoFin.slice(8, 10)} ${ym}`
  const { data: tx } = await admin.from('transacciones').insert({
    tipo: 'gasto',
    monto: sueldo,
    moneda: 'MXN',
    monto_mxn_equivalente: sueldo,
    fecha: hoy,
    concepto,
    categoria: 'nomina',
    metodo_captura: 'manual',
    metodo_pago: payload.cuentaId ? 'transferencia_bancaria' : 'otro',
    cuenta_id: payload.cuentaId ?? null,
    capturado_por: user.id,
  }).select('id').single()
  if (tx?.id) await admin.from('clinica_pagos').update({ transaccion_id: tx.id }).eq('id', pago.id)

  revalidatePath('/clinica')
  revalidatePath('/nomina/pagos')
  revalidatePath('/dashboard')
  revalidatePath('/transacciones')
  return { ok: true, total: sueldo }
}
