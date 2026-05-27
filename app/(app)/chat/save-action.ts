'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { aMxnEquivalente } from '@/lib/fx/server'

export type SavePayload = {
  tipo: 'ingreso' | 'gasto'
  monto: number
  moneda: 'MXN' | 'USD'
  fecha: string
  negocio_id: string
  cuenta_id: string
  metodo_pago?: string | null
  categoria?: string | null
  concepto?: string | null
  notas?: string | null
  metodo_captura: 'foto' | 'voz' | 'manual'
  foto_url?: string | null
  audio_url?: string | null
  raw_ai_response?: unknown
}

export async function saveAITransaccion(payload: SavePayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const fx = await aMxnEquivalente(payload.monto, payload.moneda, payload.fecha)

  const { error, data } = await supabase
    .from('transacciones')
    .insert({
      ...payload,
      monto_mxn_equivalente: fx.monto_mxn_equivalente,
      tipo_cambio_usado: fx.tipo_cambio_usado,
      capturado_por: user.id,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/transacciones')
  revalidatePath('/dashboard')
  revalidatePath('/chat')
  return { ok: true, id: data.id }
}

export type SavePorPagarPayload = {
  proveedor: string
  concepto: string
  monto_total: number
  moneda: 'MXN' | 'USD'
  fecha_emision: string | null
  fecha_vencimiento: string | null
  negocio_id: string | null
  categoria: string | null
  referencia: string | null
  documento_url: string | null
  notas: string | null
}

export async function saveCuentaPorPagarFromAI(payload: SavePorPagarPayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { error, data } = await supabase
    .from('cuentas_por_pagar')
    .insert({
      proveedor: payload.proveedor,
      concepto: payload.concepto,
      monto_total: payload.monto_total,
      monto_pagado: 0,
      moneda: payload.moneda,
      fecha_emision: payload.fecha_emision,
      fecha_vencimiento: payload.fecha_vencimiento,
      negocio_id: payload.negocio_id,
      categoria: payload.categoria,
      referencia: payload.referencia,
      documento_url: payload.documento_url,
      notas: payload.notas,
      estado: 'pendiente',
      creado_por: user.id,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/por-pagar')
  revalidatePath('/dashboard')
  revalidatePath('/chat')
  return { ok: true, id: data.id }
}
