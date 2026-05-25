import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

const subject = process.env.VAPID_SUBJECT || 'mailto:backpackboyzmexico@gmail.com'
const publicKey = process.env.VAPID_PUBLIC_KEY!
const privateKey = process.env.VAPID_PRIVATE_KEY!

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey)
}

export type PushPayload = {
  title: string
  body: string
  icon?: string
  badge?: string
  url?: string         // a dónde abrir al hacer click
  tag?: string         // dedup: notificaciones con mismo tag se reemplazan
  data?: Record<string, unknown>
}

/**
 * Envía un push a todas las subscriptions de los profile_ids dados.
 * Elimina subscriptions inválidas (410 Gone).
 */
export async function enviarPushAProfiles(
  profileIds: string[],
  payload: PushPayload
) {
  if (profileIds.length === 0) return { enviados: 0, fallidos: 0 }

  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, profile_id')
    .in('profile_id', profileIds)

  if (!subs || subs.length === 0) return { enviados: 0, fallidos: 0 }

  let enviados = 0
  let fallidos = 0
  const eliminar: string[] = []

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 } // 24h
        )
        enviados++
      } catch (e: unknown) {
        fallidos++
        const status = (e as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) {
          eliminar.push(s.id)
        }
      }
    })
  )

  if (eliminar.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', eliminar)
  }

  return { enviados, fallidos, total: subs.length, eliminadas: eliminar.length }
}
