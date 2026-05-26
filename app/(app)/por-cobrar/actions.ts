'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'
import { flashOk } from '@/lib/flash'

const Schema = z.object({
  cliente_nombre: z.string().min(1),
  cliente_telefono: z.string().optional().nullable(),
  cliente_email: z.string().optional().nullable(),
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

export type ActionState = { ok?: boolean; saldada?: boolean; error?: string; fieldErrors?: Record<string, string[]> }

function parseForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries())
  return Schema.safeParse({
    cliente_nombre: raw.cliente_nombre,
    cliente_telefono: raw.cliente_telefono || null,
    cliente_email: raw.cliente_email || null,
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

export async function createCuentaPorCobrar(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(formData)
  if (!parsed.success) {
    return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data, error } = await supabase
    .from('cuentas_por_cobrar')
    .insert({ ...parsed.data, monto_cobrado: 0, estado: 'pendiente', creado_por: user.id })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/por-cobrar')
  revalidatePath('/dashboard')
  flashOk(`/por-cobrar/${data.id}`, 'cpc_creada')
}

export async function registrarCobro(cuentaId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const monto = Number(formData.get('monto') || 0)
  const fecha_cobro = String(formData.get('fecha_cobro') || hoyEnCabos())
  const cuenta_destino_id = (formData.get('cuenta_destino_id') as string) || null
  const metodo_pago = (formData.get('metodo_pago') as string) || null
  const notas = (formData.get('notas') as string) || null

  if (!monto || monto <= 0) return { error: 'Monto inválido' }

  const { data: cuenta } = await supabase.from('cuentas_por_cobrar').select('*').eq('id', cuentaId).single()
  if (!cuenta) return { error: 'No encontré la cuenta' }

  const restante = Number(cuenta.monto_total) - Number(cuenta.monto_cobrado)
  if (monto > restante + 0.01) return { error: `Monto excede lo restante (${restante.toFixed(2)})` }

  const admin = createAdminClient()

  // 1) Crear transacción de ingreso
  const { data: tx } = await supabase
    .from('transacciones')
    .insert({
      tipo: 'ingreso',
      monto,
      moneda: cuenta.moneda,
      fecha: fecha_cobro,
      concepto: `Cobro a ${cuenta.cliente_nombre}: ${cuenta.concepto}`,
      negocio_id: cuenta.negocio_id,
      cuenta_id: cuenta_destino_id,
      metodo_pago,
      categoria: cuenta.categoria || 'cobro_cliente',
      metodo_captura: 'manual',
      capturado_por: user.id,
    })
    .select('id')
    .single()

  // 2) Registrar cobro
  await admin.from('cuentas_por_cobrar_cobros').insert({
    cuenta_id: cuentaId,
    fecha_cobro,
    monto,
    metodo_pago,
    cuenta_destino_id,
    notas,
    transaccion_id: tx?.id ?? null,
    cobrado_por: user.id,
  })

  // 3) Actualizar monto_cobrado y estado
  const nuevoCobrado = Number(cuenta.monto_cobrado) + monto
  const nuevoEstado = nuevoCobrado >= Number(cuenta.monto_total) ? 'cobrado' : 'parcial'
  await admin
    .from('cuentas_por_cobrar')
    .update({ monto_cobrado: nuevoCobrado, estado: nuevoEstado, updated_at: new Date().toISOString() })
    .eq('id', cuentaId)

  revalidatePath(`/por-cobrar/${cuentaId}`)
  revalidatePath('/por-cobrar')
  revalidatePath('/dashboard')
  return { ok: true, saldada: nuevoEstado === 'cobrado' }
}

export async function cancelarCuentaCobrar(cuentaId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('cuentas_por_cobrar')
    .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
    .eq('id', cuentaId)
  revalidatePath('/por-cobrar')
  revalidatePath(`/por-cobrar/${cuentaId}`)
}
