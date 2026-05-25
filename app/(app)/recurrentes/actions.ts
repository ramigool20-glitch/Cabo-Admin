'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'
import { proximoConDiaDelMes, siguientePago, type Frecuencia } from '@/lib/proximo-pago'

const RecurrenteSchema = z.object({
  nombre: z.string().min(1).max(120),
  monto: z.coerce.number().positive(),
  moneda: z.enum(['MXN', 'USD']),
  negocio_id: z.string().uuid().optional().nullable(),
  cuenta_id: z.string().uuid().optional().nullable(),
  responsable_id: z.string().uuid().optional().nullable(),
  metodo_pago: z.string().max(60).optional().nullable(),
  proveedor: z.string().max(120).optional().nullable(),
  referencia_pago: z.string().max(200).optional().nullable(),
  comprobante_requerido: z.coerce.boolean().default(false),
  frecuencia: z.enum(['mensual', 'quincenal', 'semanal', 'anual']),
  dia_del_mes: z.coerce.number().int().min(1).max(31).optional().nullable(),
  proximo_pago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  multa_por_no_pago: z.coerce.number().nonnegative().optional().nullable(),
  categoria: z.string().max(60).optional().nullable(),
  notas: z.string().max(500).optional().nullable(),
})

export type ActionState = {
  ok?: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries())
  // booleano viene como "on" / null
  const obj = {
    ...raw,
    comprobante_requerido: raw['comprobante_requerido'] === 'on' || raw['comprobante_requerido'] === 'true',
    negocio_id: raw['negocio_id'] || null,
    cuenta_id: raw['cuenta_id'] || null,
    responsable_id: raw['responsable_id'] || null,
    metodo_pago: raw['metodo_pago'] || null,
    proveedor: raw['proveedor'] || null,
    referencia_pago: raw['referencia_pago'] || null,
    proximo_pago: raw['proximo_pago'] || null,
    dia_del_mes: raw['dia_del_mes'] || null,
    multa_por_no_pago: raw['multa_por_no_pago'] || null,
    categoria: raw['categoria'] || null,
    notas: raw['notas'] || null,
  }
  return RecurrenteSchema.safeParse(obj)
}

export async function createRecurrente(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parse(formData)
  if (!parsed.success) {
    return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }
  }

  // Si no dieron próximo_pago pero sí dia_del_mes, lo calculamos
  let proximo = parsed.data.proximo_pago
  if (!proximo && parsed.data.dia_del_mes) {
    proximo = proximoConDiaDelMes(parsed.data.dia_del_mes, hoyEnCabos())
  }
  if (!proximo) {
    proximo = siguientePago(hoyEnCabos(), parsed.data.frecuencia as Frecuencia)
  }

  const supabase = await createClient()
  const { error } = await supabase.from('gastos_recurrentes').insert({
    ...parsed.data,
    proximo_pago: proximo,
    activo: true,
  })
  if (error) return { error: error.message }

  revalidatePath('/recurrentes')
  redirect('/recurrentes')
}

export async function updateRecurrente(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parse(formData)
  if (!parsed.success) {
    return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('gastos_recurrentes').update(parsed.data).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/recurrentes')
  redirect('/recurrentes')
}

export async function deleteRecurrente(id: string) {
  const supabase = await createClient()
  // Soft delete: marcamos inactivo
  const { error } = await supabase.from('gastos_recurrentes').update({ activo: false }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/recurrentes')
  redirect('/recurrentes')
}

/**
 * Marca un recurrente como pagado: sube comprobante (opcional), crea transacción
 * tipo gasto, registra el pago en recurrentes_pagados, avanza próximo_pago.
 */
export async function marcarPagado(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: rec, error: recErr } = await supabase
    .from('gastos_recurrentes')
    .select('*')
    .eq('id', id)
    .single()

  if (recErr || !rec) return { error: 'No encontré el recurrente' }

  const fechaPago = String(formData.get('fecha_pago') || hoyEnCabos())
  const monto = Number(formData.get('monto_pagado') || rec.monto)
  const file = formData.get('comprobante') as File | null

  let comprobanteUrl: string | null = null
  if (file && file.size > 0) {
    const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
    const path = `${user.id}/${Date.now()}.${ext}`
    const buf = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await admin.storage
      .from('comprobantes')
      .upload(path, buf, { contentType: file.type, upsert: false })
    if (upErr) return { error: `Comprobante: ${upErr.message}` }
    const { data: signed } = await admin.storage.from('comprobantes').createSignedUrl(path, 3600 * 24 * 365)
    comprobanteUrl = signed?.signedUrl ?? null
  }

  // 1) Crear transacción tipo gasto
  const { data: tx, error: txErr } = await supabase
    .from('transacciones')
    .insert({
      tipo: 'gasto',
      monto,
      moneda: rec.moneda,
      fecha: fechaPago,
      concepto: rec.nombre,
      negocio_id: rec.negocio_id,
      cuenta_id: rec.cuenta_id,
      metodo_pago: rec.metodo_pago,
      categoria: rec.categoria,
      metodo_captura: 'recurrente',
      foto_url: comprobanteUrl,
      capturado_por: user.id,
    })
    .select('id')
    .single()
  if (txErr) return { error: `Transacción: ${txErr.message}` }

  // 2) Registrar en recurrentes_pagados
  const { error: pagErr } = await supabase.from('recurrentes_pagados').insert({
    recurrente_id: rec.id,
    fecha_pago: fechaPago,
    monto_pagado: monto,
    comprobante_url: comprobanteUrl,
    pagado_por: user.id,
    transaccion_id: tx.id,
  })
  if (pagErr) return { error: `Histórico: ${pagErr.message}` }

  // 3) Avanzar próximo pago
  const proximo = rec.dia_del_mes
    ? proximoConDiaDelMes(rec.dia_del_mes, fechaPago)
    : siguientePago(fechaPago, rec.frecuencia as Frecuencia)

  await supabase.from('gastos_recurrentes').update({ proximo_pago: proximo }).eq('id', rec.id)

  revalidatePath('/recurrentes')
  revalidatePath('/transacciones')
  revalidatePath('/dashboard')
  redirect('/recurrentes')
}
