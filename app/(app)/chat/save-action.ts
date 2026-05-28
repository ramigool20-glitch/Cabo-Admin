'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { aMxnEquivalente } from '@/lib/fx/server'
import { registrarHistorial } from '@/lib/historial'
import { sincronizarTxASubTabla } from '@/lib/sync-ads-ventas'

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
  atribuido_a?: string | null  // para Casa: socio dueño del gasto personal (UUID)
  atribuido_a_nombre?: string | null  // alternativa: nombre del socio, se resuelve a UUID
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

  // Resolver atribuido_a desde nombre si vino (para Casa personal)
  let atribuidoA = payload.atribuido_a ?? null
  if (!atribuidoA && payload.atribuido_a_nombre) {
    const { data: socios } = await supabase.from('profiles').select('id, nombre').eq('activo', true)
    const h = payload.atribuido_a_nombre.toLowerCase().trim()
    atribuidoA = (socios ?? []).find((s) => s.nombre.toLowerCase().includes(h) || h.includes(s.nombre.toLowerCase()))?.id ?? null
  }

  // Separar atribuido_a_nombre del insert (no es columna)
  const { atribuido_a_nombre: _omit, ...payloadLimpio } = payload
  void _omit
  const insertData = {
    ...payloadLimpio,
    atribuido_a: atribuidoA,
    monto_mxn_equivalente: fx.monto_mxn_equivalente,
    tipo_cambio_usado: fx.tipo_cambio_usado,
    capturado_por: user.id,
  }

  const { error, data } = await supabase
    .from('transacciones')
    .insert(insertData)
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  if (data?.id) {
    await registrarHistorial(data.id, 'creada', user.id, null, insertData)
    // Sync a gastos_ads/ventas si la categoría/concepto aplica (igual que captura manual)
    await sincronizarTxASubTabla(supabase, {
      txId: data.id,
      tipo: payload.tipo,
      negocio_id: payload.negocio_id,
      monto: payload.monto,
      moneda: payload.moneda,
      fecha: payload.fecha,
      categoria: payload.categoria ?? null,
      concepto: payload.concepto ?? null,
      user_id: user.id,
      fx,
    })
  }

  revalidatePath('/transacciones')
  revalidatePath('/dashboard')
  revalidatePath('/cashflow')
  revalidatePath('/negocios')
  revalidatePath('/casa')
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
