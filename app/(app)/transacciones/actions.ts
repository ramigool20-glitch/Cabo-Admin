'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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

  const { error } = await supabase.from('transacciones').insert({
    ...parsed.data,
    metodo_captura: 'manual',
    capturado_por: user.id,
  })

  if (error) return { error: error.message }

  revalidatePath('/transacciones')
  revalidatePath('/dashboard')
  redirect('/transacciones')
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
  const { error } = await supabase.from('transacciones').update(parsed.data).eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/transacciones')
  revalidatePath('/dashboard')
  redirect('/transacciones')
}

export async function deleteTransaccion(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('transacciones').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/transacciones')
  revalidatePath('/dashboard')
  redirect('/transacciones')
}
