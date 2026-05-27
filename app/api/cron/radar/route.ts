import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ejecutarRadar } from '@/lib/ai/radar'
import { ejecutarRadarCompleto } from '@/lib/radar/orquestador'
import { enviarPushAProfiles } from '@/lib/push/server'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // 1) Análisis interno (insights basados en tu data)
  const { insights, error } = await ejecutarRadar()
  if (error) {
    await admin.from('radar_runs').insert({
      disparado_por: 'cron',
      insights_creados: 0,
      error,
    })
  } else if (insights.length > 0) {
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
        modelo_ia: 'analisis-interno',
        query_origen: 'cron-radar',
      }))
    )
  }

  // 2) Noticias frescas + espionaje de competidores + sugerencias + scores
  let monitor: Awaited<ReturnType<typeof ejecutarRadarCompleto>> | null = null
  try {
    monitor = await ejecutarRadarCompleto()
  } catch (e) {
    monitor = {
      noticias_guardadas: 0,
      ads_nuevos: 0,
      ads_inactivados: 0,
      sugerencias_nuevas: 0,
      scores_recalculados: 0,
      errores: [e instanceof Error ? e.message : String(e)],
    }
  }

  await admin.from('radar_runs').insert({
    disparado_por: 'cron',
    insights_creados: insights.length,
    error: monitor.errores.length > 0 ? monitor.errores.slice(0, 3).join(' | ').slice(0, 500) : null,
  })

  // Push si hay novedades importantes
  const altas = insights.filter((i) => i.impacto === 'alta')
  const novedades = monitor.ads_nuevos > 0 || monitor.sugerencias_nuevas > 0
  if (altas.length > 0 || novedades) {
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
        let title = '🛰️ Radar actualizado'
        let body = ''
        if (altas.length > 0) {
          title = `🚨 Radar: ${altas.length} alerta${altas.length > 1 ? 's' : ''} alta`
          body = altas[0].titulo
        } else if (monitor.ads_nuevos > 0) {
          body = `${monitor.ads_nuevos} ad${monitor.ads_nuevos > 1 ? 's' : ''} nuevo${monitor.ads_nuevos > 1 ? 's' : ''} de competidores`
          if (monitor.sugerencias_nuevas > 0) body += ` · ${monitor.sugerencias_nuevas} nuevos competidores sugeridos`
        } else if (monitor.sugerencias_nuevas > 0) {
          body = `${monitor.sugerencias_nuevas} competidor${monitor.sugerencias_nuevas > 1 ? 'es' : ''} nuevo${monitor.sugerencias_nuevas > 1 ? 's' : ''} detectado${monitor.sugerencias_nuevas > 1 ? 's' : ''}`
        }
        await enviarPushAProfiles(destinatarios, {
          title,
          body: body || 'Revisa el radar para ver detalles',
          url: '/radar',
          tag: 'radar-update',
        })
      }
    } catch {}
  }

  return NextResponse.json({
    ok: true,
    insights_creados: insights.length,
    ...monitor,
  })
}
