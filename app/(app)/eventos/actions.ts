'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { flashOk } from '@/lib/flash'
import { aMxnEquivalente } from '@/lib/fx/server'

const EventoSchema = z.object({
  negocio_id: z.string().uuid(),
  cliente_nombre: z.string().min(1),
  cliente_telefono: z.string().optional().nullable(),
  cliente_email: z.string().optional().nullable(),
  tipo_evento: z.string().optional().nullable(),
  fecha_evento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora_evento: z.string().optional().nullable(),
  monto_total: z.coerce.number().positive(),
  moneda: z.enum(['MXN', 'USD']).default('MXN'),
  comision_porcentaje: z.coerce.number().min(0).max(100).default(25),
  proveedor_nombre: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
})

const PagoSchema = z.object({
  evento_id: z.string().uuid(),
  fecha_pago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monto: z.coerce.number().positive(),
  moneda: z.enum(['MXN', 'USD']).default('MXN'),
  metodo_pago: z.string().optional().nullable(),
  cuenta_id: z.string().uuid().optional().nullable(),
  concepto: z.string().optional().nullable(),
})

export type ActionState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]> }

export async function createEvento(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(formData.entries())
  const parsed = EventoSchema.safeParse({
    ...raw,
    cliente_telefono: raw.cliente_telefono || null,
    cliente_email: raw.cliente_email || null,
    tipo_evento: raw.tipo_evento || null,
    hora_evento: raw.hora_evento || null,
    proveedor_nombre: raw.proveedor_nombre || null,
    notas: raw.notas || null,
  })
  if (!parsed.success) {
    return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data, error } = await supabase
    .from('eventos')
    .insert({ ...parsed.data, creado_por: user.id, estado: 'reservado' })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/eventos')
  flashOk(`/eventos/${data.id}`, 'evento_creado')
}

export async function registrarPagoEvento(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(formData.entries())
  const parsed = PagoSchema.safeParse({
    ...raw,
    metodo_pago: raw.metodo_pago || null,
    cuenta_id: raw.cuenta_id || null,
    concepto: raw.concepto || null,
  })
  if (!parsed.success) {
    return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { data: evento } = await supabase
    .from('eventos')
    .select('cliente_nombre, negocio_id')
    .eq('id', parsed.data.evento_id)
    .single()

  // Crear transacción tipo ingreso (con conversión MXN si es USD)
  const fx = await aMxnEquivalente(parsed.data.monto, parsed.data.moneda, parsed.data.fecha_pago)
  const { data: tx } = await supabase
    .from('transacciones')
    .insert({
      tipo: 'ingreso',
      monto: parsed.data.monto,
      moneda: parsed.data.moneda,
      monto_mxn_equivalente: fx.monto_mxn_equivalente,
      tipo_cambio_usado: fx.tipo_cambio_usado,
      fecha: parsed.data.fecha_pago,
      concepto: parsed.data.concepto || `${evento?.cliente_nombre ?? 'Cliente'} - Pago evento`,
      negocio_id: evento?.negocio_id,
      cuenta_id: parsed.data.cuenta_id,
      metodo_pago: parsed.data.metodo_pago,
      categoria: 'evento',
      metodo_captura: 'manual',
      capturado_por: user.id,
    })
    .select('id')
    .single()

  // Registrar pago vinculado
  const { error } = await supabase.from('eventos_pagos').insert({
    ...parsed.data,
    transaccion_id: tx?.id,
    capturado_por: user.id,
  })
  if (error) return { error: error.message }

  revalidatePath(`/eventos/${parsed.data.evento_id}`)
  revalidatePath('/eventos')
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * Marca el evento como realizado y reparte:
 * - 25% (comisión socios) queda como utilidad real
 * - 75% va al proveedor → se crea gasto cuando se pague al proveedor
 */
export async function realizarEvento(eventoId: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('eventos').update({ estado: 'realizado' }).eq('id', eventoId)
  revalidatePath('/eventos')
  revalidatePath(`/eventos/${eventoId}`)
}

export async function pagarProveedor(eventoId: string, cuentaId: string | null): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: evento } = await supabase.from('eventos').select('*').eq('id', eventoId).single()
  if (!evento) return

  const montoProveedor = Number(evento.monto_total) * (1 - Number(evento.comision_porcentaje) / 100)

  const fechaHoy = new Date().toISOString().slice(0, 10)
  const fxProv = await aMxnEquivalente(montoProveedor, evento.moneda as 'MXN' | 'USD', fechaHoy)
  await supabase.from('transacciones').insert({
    tipo: 'gasto',
    monto: montoProveedor,
    moneda: evento.moneda,
    monto_mxn_equivalente: fxProv.monto_mxn_equivalente,
    tipo_cambio_usado: fxProv.tipo_cambio_usado,
    fecha: fechaHoy,
    concepto: `Pago a ${evento.proveedor_nombre ?? 'proveedor'} por evento ${evento.cliente_nombre}`,
    negocio_id: evento.negocio_id,
    cuenta_id: cuentaId,
    categoria: 'pago_proveedor',
    metodo_captura: 'manual',
    capturado_por: user.id,
  })

  await supabase
    .from('eventos')
    .update({ estado: 'pagado_proveedor', proveedor_pagado: true })
    .eq('id', eventoId)

  revalidatePath(`/eventos/${eventoId}`)
  revalidatePath('/eventos')
  revalidatePath('/dashboard')
}
