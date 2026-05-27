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

export async function agregarCompetidor(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const dominio_propio = String(formData.get('dominio_propio') || '').trim()
  const competidor_nombre = String(formData.get('competidor_nombre') || '').trim()
  const competidor_url = String(formData.get('competidor_url') || '').trim() || null
  const tipo = String(formData.get('tipo') || 'directo')
  const descripcion = String(formData.get('descripcion') || '').trim() || null

  if (!dominio_propio || !competidor_nombre) {
    return { ok: false, error: 'Falta dominio propio o nombre competidor' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('radar_competidores').insert({
    dominio_propio,
    competidor_nombre,
    competidor_url,
    tipo,
    descripcion,
    agregado_por: user.id,
    activo: true,
  })
  if (error) {
    if (/relation.*does not exist/i.test(error.message)) {
      return { ok: false, error: 'Tabla radar_competidores no existe. Pega la migración 0015_radar_competidores.sql.' }
    }
    return { ok: false, error: error.message }
  }

  revalidatePath('/radar')
  return { ok: true }
}

export async function eliminarCompetidor(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  await admin.from('radar_competidores').delete().eq('id', id)
  revalidatePath('/radar')
  return { ok: true }
}
