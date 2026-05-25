'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function registrarMovimiento(
  supabase: Awaited<ReturnType<typeof createClient>>,
  multa_id: string,
  actor_id: string,
  accion: string,
  mensaje?: string | null,
  monto_propuesto?: number | null
) {
  await supabase.from('multa_movimientos').insert({
    multa_id,
    actor_id,
    accion,
    mensaje: mensaje ?? null,
    monto_propuesto: monto_propuesto ?? null,
  })
}

/**
 * Responsable acepta la multa tal cual → se aplica (crea transacción).
 */
export async function aceptarMulta(multaId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: multa } = await supabase.from('multas').select('*').eq('id', multaId).single()
  if (!multa) return

  const montoFinal = multa.monto_propuesto

  // Crear transacción de multa_interna
  const { data: tx } = await supabase
    .from('transacciones')
    .insert({
      tipo: 'multa_interna',
      monto: montoFinal,
      moneda: multa.moneda,
      fecha: new Date().toISOString().slice(0, 10),
      concepto: multa.motivo,
      categoria: 'multa',
      metodo_captura: 'multa',
      multa_id: multa.id,
      capturado_por: multa.responsable_id,
    })
    .select('id')
    .single()

  await supabase
    .from('multas')
    .update({
      estado: 'aplicada',
      monto_final: montoFinal,
      aprobada_por: user.id,
      transaccion_id: tx?.id,
      resuelta_at: new Date().toISOString(),
    })
    .eq('id', multaId)

  await registrarMovimiento(supabase, multaId, user.id, 'aceptar')

  revalidatePath('/multas')
  revalidatePath('/dashboard')
}

/**
 * Responsable justifica con texto → estado pasa a 'justificada', otro socio decide.
 */
export async function justificarMulta(multaId: string, mensaje: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('multas')
    .update({ estado: 'justificada' })
    .eq('id', multaId)

  await registrarMovimiento(supabase, multaId, user.id, 'justificar', mensaje)

  revalidatePath('/multas')
}

/**
 * Responsable solicita reducción con nuevo monto + motivo.
 */
export async function solicitarReduccionMulta(
  multaId: string,
  nuevoMonto: number,
  mensaje: string
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('multas')
    .update({ estado: 'reduccion_solicitada' })
    .eq('id', multaId)

  await registrarMovimiento(supabase, multaId, user.id, 'solicitar_reduccion', mensaje, nuevoMonto)

  revalidatePath('/multas')
}

/**
 * Otro socio aprueba la multa tal cual → se aplica.
 */
export async function aprobarMulta(multaId: string): Promise<void> {
  return aceptarMulta(multaId) // misma lógica
}

/**
 * Otro socio reduce el monto a uno menor.
 */
export async function reducirMulta(multaId: string, nuevoMonto: number, mensaje?: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: multa } = await supabase.from('multas').select('*').eq('id', multaId).single()
  if (!multa) return

  const { data: tx } = await supabase
    .from('transacciones')
    .insert({
      tipo: 'multa_interna',
      monto: nuevoMonto,
      moneda: multa.moneda,
      fecha: new Date().toISOString().slice(0, 10),
      concepto: `${multa.motivo} (reducida)`,
      categoria: 'multa',
      metodo_captura: 'multa',
      multa_id: multa.id,
      capturado_por: multa.responsable_id,
    })
    .select('id')
    .single()

  await supabase
    .from('multas')
    .update({
      estado: 'aplicada',
      monto_final: nuevoMonto,
      aprobada_por: user.id,
      transaccion_id: tx?.id,
      resuelta_at: new Date().toISOString(),
    })
    .eq('id', multaId)

  await registrarMovimiento(supabase, multaId, user.id, 'reducir', mensaje, nuevoMonto)

  revalidatePath('/multas')
  revalidatePath('/dashboard')
}

/**
 * Otro socio perdona la multa → no se aplica, monto_final = 0.
 */
export async function perdonarMulta(multaId: string, mensaje?: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('multas')
    .update({
      estado: 'perdonada',
      monto_final: 0,
      aprobada_por: user.id,
      resuelta_at: new Date().toISOString(),
    })
    .eq('id', multaId)

  await registrarMovimiento(supabase, multaId, user.id, 'perdonar', mensaje)

  revalidatePath('/multas')
}

/**
 * Marca como pendiente_conversacion: no se aplica al balance hasta resolver.
 */
export async function disputarMulta(multaId: string, mensaje: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('multas')
    .update({ estado: 'pendiente_conversacion' })
    .eq('id', multaId)

  await registrarMovimiento(supabase, multaId, user.id, 'disputar', mensaje)

  revalidatePath('/multas')
}

/**
 * Liquidar: el responsable paga el balance acumulado al otro socio.
 * Crea una transacción tipo liquidacion_socio.
 */
export async function liquidarBalance(payload: {
  pagador_id: string
  receptor_id: string
  monto: number
  moneda: 'MXN' | 'USD'
  cuenta_id?: string | null
}): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Marca todas las multas aplicadas con responsable=pagador como liquidadas
  await supabase
    .from('transacciones')
    .insert({
      tipo: 'liquidacion_socio',
      monto: payload.monto,
      moneda: payload.moneda,
      fecha: new Date().toISOString().slice(0, 10),
      concepto: `Liquidación entre socios`,
      categoria: 'liquidacion',
      metodo_captura: 'liquidacion',
      cuenta_id: payload.cuenta_id ?? null,
      capturado_por: user.id,
    })

  revalidatePath('/multas')
  revalidatePath('/dashboard')
}
