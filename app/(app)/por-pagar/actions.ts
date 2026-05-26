'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'

const Schema = z.object({
  proveedor: z.string().min(1),
  proveedor_telefono: z.string().optional().nullable(),
  proveedor_email: z.string().optional().nullable(),
  negocio_id: z.string().uuid().optional().nullable(),
  concepto: z.string().min(1),
  monto_total: z.coerce.number().positive(),
  moneda: z.enum(['MXN', 'USD']).default('MXN'),
  fecha_emision: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  fecha_vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  categoria: z.string().optional().nullable(),
  referencia: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
})

export type ActionState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]> }

function parseForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries())
  return Schema.safeParse({
    proveedor: raw.proveedor,
    proveedor_telefono: raw.proveedor_telefono || null,
    proveedor_email: raw.proveedor_email || null,
    negocio_id: raw.negocio_id || null,
    concepto: raw.concepto,
    monto_total: raw.monto_total,
    moneda: raw.moneda || 'MXN',
    fecha_emision: raw.fecha_emision || null,
    fecha_vencimiento: raw.fecha_vencimiento || null,
    categoria: raw.categoria || null,
    referencia: raw.referencia || null,
    notas: raw.notas || null,
  })
}

export async function createCuentaPorPagar(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(formData)
  if (!parsed.success) {
    return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data, error } = await supabase
    .from('cuentas_por_pagar')
    .insert({ ...parsed.data, monto_pagado: 0, estado: 'pendiente', creado_por: user.id })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/por-pagar')
  revalidatePath('/dashboard')
  redirect(`/por-pagar/${data.id}`)
}

export async function registrarPago(cuentaId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const monto = Number(formData.get('monto') || 0)
  const fecha_pago = String(formData.get('fecha_pago') || hoyEnCabos())
  const cuenta_origen_id = (formData.get('cuenta_origen_id') as string) || null
  const metodo_pago = (formData.get('metodo_pago') as string) || null
  const notas = (formData.get('notas') as string) || null

  if (!monto || monto <= 0) return { error: 'Monto inválido' }

  const { data: cuenta } = await supabase.from('cuentas_por_pagar').select('*').eq('id', cuentaId).single()
  if (!cuenta) return { error: 'No encontré la cuenta' }

  const restante = Number(cuenta.monto_total) - Number(cuenta.monto_pagado)
  if (monto > restante + 0.01) return { error: `Monto excede lo restante (${restante.toFixed(2)})` }

  const admin = createAdminClient()

  // 1) Crear transacción de gasto
  const { data: tx } = await supabase
    .from('transacciones')
    .insert({
      tipo: 'gasto',
      monto,
      moneda: cuenta.moneda,
      fecha: fecha_pago,
      concepto: `Pago a ${cuenta.proveedor}: ${cuenta.concepto}`,
      negocio_id: cuenta.negocio_id,
      cuenta_id: cuenta_origen_id,
      metodo_pago,
      categoria: cuenta.categoria || 'proveedor',
      metodo_captura: 'manual',
      capturado_por: user.id,
    })
    .select('id')
    .single()

  // 2) Registrar pago
  await admin.from('cuentas_por_pagar_pagos').insert({
    cuenta_id: cuentaId,
    fecha_pago,
    monto,
    metodo_pago,
    cuenta_origen_id,
    notas,
    transaccion_id: tx?.id ?? null,
    pagado_por: user.id,
  })

  // 3) Actualizar monto_pagado y estado
  const nuevoPagado = Number(cuenta.monto_pagado) + monto
  const nuevoEstado = nuevoPagado >= Number(cuenta.monto_total) ? 'pagado' : 'parcial'
  await admin
    .from('cuentas_por_pagar')
    .update({ monto_pagado: nuevoPagado, estado: nuevoEstado, updated_at: new Date().toISOString() })
    .eq('id', cuentaId)

  revalidatePath(`/por-pagar/${cuentaId}`)
  revalidatePath('/por-pagar')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function cancelarCuenta(cuentaId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('cuentas_por_pagar')
    .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
    .eq('id', cuentaId)
  revalidatePath('/por-pagar')
  revalidatePath(`/por-pagar/${cuentaId}`)
}
