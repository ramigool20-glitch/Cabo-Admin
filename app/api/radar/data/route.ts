import { NextResponse } from 'next/server'
import { requireSocio } from '@/lib/auth/require-socio'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET() {
  const g = await requireSocio()
  if (g instanceof NextResponse) return g
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createAdminClient()

  let insights: unknown[] = []
  let ultimaCorrida: unknown = null
  let competidores: unknown[] = []
  let noticias: unknown[] = []
  let sugerencias: unknown[] = []
  let adsActivos: unknown[] = []
  let negocios: unknown[] = []
  const errors: { tabla: string; msg: string }[] = []

  try {
    const { data, error } = await admin
      .from('radar_insights')
      .select('id, tipo, titulo, resumen, fuente, fuente_url, impacto, aplica_a, recomendacion, fecha_evento, visto, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) errors.push({ tabla: 'radar_insights', msg: error.message })
    else insights = data ?? []
  } catch (e) {
    errors.push({ tabla: 'radar_insights', msg: e instanceof Error ? e.message : 'fail' })
  }

  try {
    const { data } = await admin
      .from('radar_runs')
      .select('created_at, insights_creados, error')
      .order('created_at', { ascending: false })
      .limit(1)
    ultimaCorrida = (data ?? [])[0] ?? null
  } catch {}

  try {
    const { data, error } = await admin
      .from('radar_competidores')
      .select('id, dominio_propio, competidor_nombre, competidor_url, descripcion, tipo, notas, created_at, negocio_id, score_amenaza, score_razon, score_analisis_at, keywords_match, ultima_revision_at, pagina_fb, pagina_ig')
      .eq('activo', true)
      .order('score_amenaza', { ascending: false, nullsFirst: false })
    if (error && !/relation.*does not exist/i.test(error.message)) {
      errors.push({ tabla: 'radar_competidores', msg: error.message })
    } else if (!error) {
      competidores = data ?? []
    }
  } catch {}

  try {
    const { data, error } = await admin
      .from('radar_noticias')
      .select('id, titulo, resumen, url, fuente, fuente_logo_url, imagen_url, publicada_at, query_origen, aplica_a, fetched_at, vista')
      .order('publicada_at', { ascending: false, nullsFirst: false })
      .limit(40)
    if (error && !/relation.*does not exist/i.test(error.message)) {
      errors.push({ tabla: 'radar_noticias', msg: error.message })
    } else if (!error) {
      noticias = data ?? []
    }
  } catch {}

  try {
    const { data, error } = await admin
      .from('radar_competidores_sugeridos')
      .select('id, negocio_id, competidor_nombre, pagina_fb, pagina_ig, url, motivo, ads_activos_count, keywords_match, primera_vez_visto_at, estado')
      .eq('estado', 'pendiente')
      .order('ads_activos_count', { ascending: false })
      .limit(30)
    if (error && !/relation.*does not exist/i.test(error.message)) {
      errors.push({ tabla: 'radar_competidores_sugeridos', msg: error.message })
    } else if (!error) {
      sugerencias = data ?? []
    }
  } catch {}

  try {
    const { data, error } = await admin
      .from('radar_ads_snapshots')
      .select('id, competidor_id, ad_id, plataforma, page_name, ad_creative_body, ad_creative_link_title, ad_snapshot_url, imagen_url, inicio, fin, paises, primera_vez_visto_at, ultima_vez_visto_at, activo')
      .eq('activo', true)
      .order('primera_vez_visto_at', { ascending: false })
      .limit(50)
    if (error && !/relation.*does not exist/i.test(error.message)) {
      errors.push({ tabla: 'radar_ads_snapshots', msg: error.message })
    } else if (!error) {
      adsActivos = data ?? []
    }
  } catch {}

  try {
    const { data } = await admin
      .from('negocios')
      .select('id, nombre, tipo, activo, keywords_busqueda')
      .eq('activo', true)
      .order('nombre')
    negocios = data ?? []
  } catch {}

  return NextResponse.json({
    insights,
    ultimaCorrida,
    competidores,
    noticias,
    sugerencias,
    adsActivos,
    negocios,
    metaConfigurado: !!process.env.META_AD_LIBRARY_TOKEN,
    errors,
  })
}
