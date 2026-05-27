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
  const { insights, error } = await ejecutarRadar()

  if (error) {
    await admin.from('radar_runs').insert({
      disparado_por: 'manual',
      insights_creados: 0,
      error,
    })
    return { ok: false, error }
  }

  if (insights.length > 0) {
    await admin.from('radar_insights').insert(
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
        modelo_ia: 'gpt-4o-mini',
        query_origen: 'manual',
      }))
    )
  }

  await admin.from('radar_runs').insert({
    disparado_por: 'manual',
    insights_creados: insights.length,
  })

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
