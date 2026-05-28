'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'

export type PagoState = { ok?: boolean; error?: string }

/**
 * Marca un periodo como pagado para un empleado y genera la transacción de gasto.
 */
export async function pagarNomina(formData: FormData): Promise<PagoState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const empleadoId = String(formData.get('empleado_id') || '')
  const empleadoNombre = String(formData.get('empleado_nombre') || 'Empleado')
  const periodoInicio = String(formData.get('periodo_inicio') || '')
  const periodoFin = String(formData.get('periodo_fin') || '')
  const sueldo = Number(formData.get('sueldo') || 0)
  const comisiones = Number(formData.get('comisiones') || 0)
  const propinas = Number(formData.get('propinas') || 0)
  const bono = Number(formData.get('bono') || 0)
  const extras = Number(formData.get('extras') || 0)
  const cuentaId = String(formData.get('cuenta_id') || '') || null
  const negocioId = String(formData.get('negocio_id') || '') || null
  const total = sueldo + comisiones + propinas + bono + extras

  if (total <= 0) return { error: 'Total en 0, nada que pagar' }

  const admin = createAdminClient()
  const fecha = hoyEnCabos()

  // Crear transacción de gasto (nómina)
  const { data: tx, error: txErr } = await admin.from('transacciones').insert({
    tipo: 'gasto',
    monto: total,
    moneda: 'MXN',
    monto_mxn_equivalente: total,
    tipo_cambio_usado: 1,
    fecha,
    negocio_id: negocioId,
    cuenta_id: cuentaId,
    categoria: 'nomina',
    concepto: `Nómina ${empleadoNombre} (${periodoInicio} a ${periodoFin})`,
    metodo_pago: 'otro',
    metodo_captura: 'manual',
    capturado_por: user.id,
    notas: `Sueldo ${sueldo} + comisiones ${comisiones} + propinas ${propinas} + bono ${bono} + extras ${extras}`,
  }).select('id').single()

  if (txErr) return { error: txErr.message }

  // Registrar el pago de nómina
  const { error: pagoErr } = await admin.from('nomina_pagos').insert({
    empleado_id: empleadoId,
    periodo_inicio: periodoInicio,
    periodo_fin: periodoFin,
    sueldo_base: sueldo,
    comisiones, propinas, bono, extras, total,
    moneda: 'MXN',
    pagado: true,
    fecha_pago: fecha,
    transaccion_id: tx?.id ?? null,
  })
  if (pagoErr) {
    if (/relation.*does not exist/i.test(pagoErr.message)) {
      return { error: 'Falta pegar migración 0028_nomina_pagos.sql' }
    }
    return { error: pagoErr.message }
  }

  // Marcar extras del periodo como pagados
  await admin.from('empleado_extras')
    .update({ pagado: true })
    .eq('empleado_id', empleadoId)
    .eq('pagado', false)
    .gte('fecha', periodoInicio)
    .lte('fecha', periodoFin)

  revalidatePath('/nomina')
  revalidatePath('/dashboard')
  revalidatePath('/cashflow')
  return { ok: true }
}

/**
 * Agrega un extra/bono one-off (ej: $200 comida Doña Rossy).
 */
export async function agregarExtra(formData: FormData): Promise<PagoState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const empleadoId = String(formData.get('empleado_id') || '')
  const concepto = String(formData.get('concepto') || '').trim()
  const monto = Number(formData.get('monto') || 0)
  if (!empleadoId || !concepto || monto <= 0) return { error: 'Datos incompletos' }

  const admin = createAdminClient()
  const { error } = await admin.from('empleado_extras').insert({
    empleado_id: empleadoId,
    fecha: hoyEnCabos(),
    concepto,
    monto,
    moneda: 'MXN',
    pagado: false,
    aprobado_por: user.id,
  })
  if (error) {
    if (/relation.*does not exist/i.test(error.message)) {
      return { error: 'Falta pegar migración 0028_nomina_pagos.sql' }
    }
    return { error: error.message }
  }
  revalidatePath('/nomina')
  return { ok: true }
}
