import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createAdminClient()

  // Defensive: si las tablas no existen, devolvemos error claro
  let insights: unknown[] = []
  let ultimaCorrida: unknown = null
  let competidores: unknown[] = []
  let errors: { tabla: string; msg: string }[] = []

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
      .select('id, dominio_propio, competidor_nombre, competidor_url, descripcion, tipo, notas, created_at')
      .order('dominio_propio', { ascending: true })
    if (error && !/relation.*does not exist/i.test(error.message)) {
      errors.push({ tabla: 'radar_competidores', msg: error.message })
    } else if (!error) {
      competidores = data ?? []
    }
  } catch {}

  return NextResponse.json({ insights, ultimaCorrida, competidores, errors })
}
