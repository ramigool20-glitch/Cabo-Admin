import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ejecutarRadar } from '@/lib/ai/radar'
import { enviarPushAProfiles } from '@/lib/push/server'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { insights, error } = await ejecutarRadar()

  if (error) {
    await admin.from('radar_runs').insert({
      disparado_por: 'cron',
      insights_creados: 0,
      error,
    })
    return NextResponse.json({ ok: false, error })
  }

  // Insertar todos los insights nuevos
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
        query_origen: 'cron-radar',
      }))
    )
  }

  await admin.from('radar_runs').insert({
    disparado_por: 'cron',
    insights_creados: insights.length,
  })

  // Push si hay insights de impacto alta
  const altas = insights.filter((i) => i.impacto === 'alta')
  if (altas.length > 0) {
    try {
      const { data: socios } = await admin
        .from('profiles')
        .select('id, role_id, roles(nombre)')
        .eq('activo', true)
      const destinatarios = (socios ?? [])
        .filter((p) => {
          const r = p.roles as unknown as { nombre: string } | null
          return r?.nombre === 'admin' || r?.nombre === 'socio'
        })
        .map((p) => p.id)
      if (destinatarios.length > 0) {
        await enviarPushAProfiles(destinatarios, {
          title: `🛰️ Radar: ${altas.length} alerta${altas.length > 1 ? 's' : ''} de alto impacto`,
          body: altas[0].titulo + (altas.length > 1 ? ` (+${altas.length - 1} más)` : ''),
          url: '/radar',
          tag: 'radar-alta',
        })
      }
    } catch {}
  }

  return NextResponse.json({ ok: true, insights_creados: insights.length })
}
