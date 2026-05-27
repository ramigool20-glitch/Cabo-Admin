import { createAdminClient } from '@/lib/supabase/admin'
import { enviarPushAProfiles } from './server'

/**
 * Dispara cualquier push programado que ya esté en su fecha de fire_at.
 * Llamado desde requests para "trigger on traffic" — no requiere cron premium.
 * Idempotente: marca como sent=true para no duplicar.
 */
export async function dispararPushesProgramados(): Promise<{ disparados: number; error?: string }> {
  try {
    const admin = createAdminClient()
    const ahora = new Date().toISOString()

    const { data: pendientes, error } = await admin
      .from('push_scheduled')
      .select('*')
      .eq('sent', false)
      .lte('fire_at', ahora)
      .order('fire_at')
      .limit(20)

    if (error) return { disparados: 0, error: error.message }
    if (!pendientes || pendientes.length === 0) return { disparados: 0 }

    let disparados = 0
    for (const p of pendientes) {
      try {
        await enviarPushAProfiles(p.profile_ids as string[], {
          title: p.title,
          body: p.body,
          url: p.url || '/dashboard',
          tag: p.tag || `sched-${p.id}`,
        })
        await admin
          .from('push_scheduled')
          .update({ sent: true, sent_at: new Date().toISOString() })
          .eq('id', p.id)
        disparados++
      } catch (e) {
        // Marca como sent para no reintentar infinito
        await admin
          .from('push_scheduled')
          .update({ sent: true, sent_at: new Date().toISOString() })
          .eq('id', p.id)
      }
    }

    return { disparados }
  } catch (e) {
    return { disparados: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Programa pushes en el futuro (en una tabla DB).
 */
export async function programarPushes(opts: {
  profile_ids: string[]
  title: string
  body: string
  url?: string
  tag?: string
  delays_minutos: number[]  // ej: [15, 30, 45] = 3 pushes a 15, 30, 45 min de ahora
}): Promise<{ programados: number; error?: string }> {
  try {
    const admin = createAdminClient()
    const ahora = Date.now()
    const filas = opts.delays_minutos.map((delay, i) => ({
      profile_ids: opts.profile_ids,
      title: opts.title,
      body: `${opts.body}${opts.delays_minutos.length > 1 ? ` (${i + 1}/${opts.delays_minutos.length})` : ''}`,
      url: opts.url || null,
      tag: opts.tag || null,
      fire_at: new Date(ahora + delay * 60 * 1000).toISOString(),
    }))
    const { error } = await admin.from('push_scheduled').insert(filas)
    if (error) return { programados: 0, error: error.message }
    return { programados: filas.length }
  } catch (e) {
    return { programados: 0, error: e instanceof Error ? e.message : String(e) }
  }
}
