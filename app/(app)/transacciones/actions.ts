'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { flashOk } from '@/lib/flash'
import { aMxnEquivalente } from '@/lib/fx/server'

const TransaccionSchema = z.object({
  tipo: z.enum(['ingreso', 'gasto']),
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
  moneda: z.enum(['MXN', 'USD']),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  negocio_id: z.string().uuid('Selecciona un negocio'),
  cuenta_id: z.string().uuid('Selecciona una cuenta'),
  metodo_pago: z.enum([
    'stripe', 'mp_terminal', 'mp_transferencia', 'mp_link',
    'efectivo_mxn', 'efectivo_usd', 'transferencia_bancaria',
    'tarjeta', 'domiciliado', 'otro',
  ]).optional().nullable(),
  categoria: z.string().max(60).optional().nullable(),
  concepto: z.string().max(200).optional().nullable(),
  notas: z.string().max(500).optional().nullable(),
  atribuido_a: z.string().uuid().optional().nullable(),
})

export type ActionState = {
  ok?: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

function parseFormData(formData: FormData) {
  const raw = {
    tipo: formData.get('tipo'),
    monto: formData.get('monto'),
    moneda: formData.get('moneda'),
    fecha: formData.get('fecha'),
    negocio_id: formData.get('negocio_id'),
    cuenta_id: formData.get('cuenta_id'),
    metodo_pago: formData.get('metodo_pago') || null,
    categoria: formData.get('categoria') || null,
    concepto: formData.get('concepto') || null,
    notas: formData.get('notas') || null,
    atribuido_a: formData.get('atribuido_a') || null,
  }
  return TransaccionSchema.safeParse(raw)
}

export async function createTransaccion(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parseFormData(formData)
  if (!parsed.success) {
    return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // Calcular equivalente en MXN según el tipo de cambio del día de la transacción
  const fx = await aMxnEquivalente(parsed.data.monto, parsed.data.moneda, parsed.data.fecha)

  const { error } = await supabase.from('transacciones').insert({
    ...parsed.data,
    monto_mxn_equivalente: fx.monto_mxn_equivalente,
    tipo_cambio_usado: fx.tipo_cambio_usado,
    metodo_captura: 'manual',
    capturado_por: user.id,
  })

  if (error) return { error: error.message }

  revalidatePath('/transacciones')
  revalidatePath('/dashboard')
  flashOk('/transacciones', 'tx_creada')
}

export async function updateTransaccion(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parseFormData(formData)
  if (!parsed.success) {
    return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()

  // Recalcular equivalente MXN porque pudo haber cambiado monto/moneda/fecha
  const fx = await aMxnEquivalente(parsed.data.monto, parsed.data.moneda, parsed.data.fecha)

  const { error } = await supabase.from('transacciones').update({
    ...parsed.data,
    monto_mxn_equivalente: fx.monto_mxn_equivalente,
    tipo_cambio_usado: fx.tipo_cambio_usado,
  }).eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/transacciones')
  revalidatePath('/dashboard')
  flashOk('/transacciones', 'tx_actualizada')
}

export async function deleteTransaccion(id: string) {
  const supabase = await createClient()

  // Limpiar todas las FKs antes de borrar la transacción
  await Promise.all([
    // Si vino de un pago recurrente, borrar el registro de recurrentes_pagados
    supabase.from('recurrentes_pagados').delete().eq('transaccion_id', id),
    // Desligar otras tablas que pueden referenciarla (no las borramos, solo unlinkeamos)
    supabase.from('cobros_stripe').update({ transaccion_id: null }).eq('transaccion_id', id),
    supabase.from('eventos_pagos').update({ transaccion_id: null }).eq('transaccion_id', id),
    supabase.from('multas').update({ transaccion_id: null }).eq('transaccion_id', id),
  ])

  const { error } = await supabase.from('transacciones').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/transacciones')
  revalidatePath('/dashboard')
  flashOk('/transacciones', 'tx_eliminada')
}
