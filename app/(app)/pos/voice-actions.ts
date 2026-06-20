'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logger/server'

const GuardarSchema = z.object({
  keyword: z.string().min(1).max(60),
  categoria: z.enum(['precio', 'cancelacion', 'devolucion', 'problema', 'fiado', 'general']),
  transcript: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1).optional(),
  idioma: z.enum(['es', 'en', 'mixto', 'desconocido']).optional(),
  nivel: z.enum(['nota', 'venta', 'conversacion', 'critico']).optional(),
  monto_detectado_mxn: z.number().optional().nullable(),
  monto_original: z.number().optional().nullable(),
  monto_moneda: z.enum(['MXN', 'USD']).optional().nullable(),
  tipo_cambio_aplicado: z.number().optional().nullable(),
  es_venta_potencial: z.boolean().optional(),
})

export type GuardarResult = { ok?: boolean; error?: string; id?: string }

export async function guardarVoiceEvent(input: z.infer<typeof GuardarSchema>): Promise<GuardarResult> {
  const parsed = GuardarSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  try {
    const { data: prof } = await admin
      .from('profiles').select('nombre').eq('id', user.id).single()
    const { data: negocio } = await admin
      .from('negocios').select('id').ilike('nombre', '%cvu pharmacy local%').maybeSingle()

    const { data, error } = await admin
      .from('voice_events')
      .insert({
        profile_id: user.id,
        profile_nombre: (prof?.nombre as string) ?? null,
        negocio_id: negocio?.id ?? null,
        keyword: parsed.data.keyword,
        categoria: parsed.data.categoria,
        transcript: parsed.data.transcript,
        confidence: parsed.data.confidence ?? null,
        idioma: parsed.data.idioma ?? 'es',
        nivel: parsed.data.nivel ?? 'nota',
        monto_detectado_mxn: parsed.data.monto_detectado_mxn ?? null,
        monto_original: parsed.data.monto_original ?? null,
        monto_moneda: parsed.data.monto_moneda ?? null,
        tipo_cambio_aplicado: parsed.data.tipo_cambio_aplicado ?? null,
        es_venta_potencial: parsed.data.es_venta_potencial ?? false,
      })
      .select('id')
      .single()

    if (error) {
      await logError('voice-actions/guardar', error, { keyword: parsed.data.keyword })
      return { error: error.message }
    }

    return { ok: true, id: data.id as string }
  } catch (e) {
    await logError('voice-actions/guardar', e, { keyword: parsed.data.keyword })
    return { error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}

/** Auditoría: suma ventas escuchadas vs cobradas en el POS hoy.
 *  Si discrepancia > 10%, dispara push a admin. */
export async function auditarVoz(): Promise<{
  ok?: boolean
  error?: string
  total_escuchado: number
  total_cobrado: number
  diferencia: number
  porcentaje: number
  alerta: boolean
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado', total_escuchado: 0, total_cobrado: 0, diferencia: 0, porcentaje: 0, alerta: false }

  const admin = createAdminClient()
  const hoy = new Date().toISOString().slice(0, 10)

  // Total escuchado en conversaciones (es_venta_potencial)
  const { data: eventos } = await admin
    .from('voice_events')
    .select('monto_detectado_mxn')
    .eq('profile_id', user.id)
    .eq('es_venta_potencial', true)
    .gte('created_at', `${hoy}T00:00:00`)
  const totalEscuchado = (eventos ?? []).reduce((s, e) => s + Number(e.monto_detectado_mxn ?? 0), 0)

  // Total cobrado en POS (transacciones tipo=ingreso con items)
  const { data: txs } = await admin
    .from('transacciones')
    .select('monto, monto_mxn_equivalente, moneda')
    .eq('tiene_items', true)
    .eq('tipo', 'ingreso')
    .eq('capturado_por', user.id)
    .gte('fecha', hoy)
  const totalCobrado = (txs ?? []).reduce((s, t) => s + Number(t.monto_mxn_equivalente ?? t.monto ?? 0), 0)

  const diferencia = totalEscuchado - totalCobrado
  const base = Math.max(totalEscuchado, totalCobrado, 1)
  const porcentaje = Math.abs(diferencia / base) * 100
  const alerta = porcentaje > 10 && Math.abs(diferencia) > 200  // umbral 10% y mínimo $200 MXN

  return {
    ok: true,
    total_escuchado: totalEscuchado,
    total_cobrado: totalCobrado,
    diferencia,
    porcentaje,
    alerta,
  }
}
