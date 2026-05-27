'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ejecutarRadar } from '@/lib/ai/radar'

export async function refrescarRadar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const admin = createAdminClient()

  // Verifica que la tabla exista antes de continuar
  const probe = await admin.from('radar_insights').select('id').limit(1)
  if (probe.error) {
    return {
      ok: false,
      error: 'La tabla radar_insights no existe. Pega la migración 0014_radar.sql en Supabase.',
    }
  }

  let result: Awaited<ReturnType<typeof ejecutarRadar>>
  try {
    result = await ejecutarRadar()
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Error ejecutando radar'
    try {
      await admin.from('radar_runs').insert({
        disparado_por: 'manual',
        insights_creados: 0,
        error: error.slice(0, 500),
      })
    } catch {}
    return { ok: false, error }
  }

  const { insights, error } = result

  if (error) {
    try {
      await admin.from('radar_runs').insert({
        disparado_por: 'manual',
        insights_creados: 0,
        error: error.slice(0, 500),
      })
    } catch {}
    return { ok: false, error }
  }

  if (insights.length > 0) {
    const insertRes = await admin.from('radar_insights').insert(
      insights.map((i) => ({
        tipo: i.tipo,
        titulo: i.titulo,
        resumen: i.resumen,
        fuente: i.fuente,
        fuente_url: i.fuente_url,
        impacto: i.impacto,
        aplica_a: i.aplica_a,
        recomendacion: i.recomendacion,
        fecha_evento: i.fecha_evento,
        modelo_ia: 'analisis-interno',
        query_origen: 'manual',
      }))
    )
    if (insertRes.error) {
      return { ok: false, error: `No se pudieron guardar insights: ${insertRes.error.message}` }
    }
  }

  try {
    await admin.from('radar_runs').insert({
      disparado_por: 'manual',
      insights_creados: insights.length,
    })
  } catch {}

  revalidatePath('/radar')
  return { ok: true, count: insights.length }
}

export async function marcarVisto(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  await admin
    .from('radar_insights')
    .update({ visto: true, visto_por: user.id, visto_at: new Date().toISOString() })
    .eq('id', id)
  revalidatePath('/radar')
  return { ok: true }
}

export async function descartarInsight(id: string) {
  const admin = createAdminClient()
  await admin.from('radar_insights').delete().eq('id', id)
  revalidatePath('/radar')
  return { ok: true }
}
