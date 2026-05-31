import { NextResponse } from 'next/server'
import { requireSocio } from '@/lib/auth/require-socio'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const maxDuration = 60

const subject = process.env.VAPID_SUBJECT || 'mailto:backpackboyzmexico@gmail.com'
const publicKey = process.env.VAPID_PUBLIC_KEY!
const privateKey = process.env.VAPID_PRIVATE_KEY!

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey)
}

/**
 * Endpoint de diagnóstico. Muestra:
 * - Cuántas suscripciones hay registradas y a qué socios pertenecen
 * - Endpoint (truncado) y proveedor (Apple, FCM, Mozilla)
 * - Intenta mandar un push de prueba a CADA suscripción y reporta resultado individual
 * - Las que fallen con 404/410 las marca como inválidas y las borra
 */
export async function POST(req: Request) {
  const g = await requireSocio()
  if (g instanceof NextResponse) return g
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createAdminClient()

  // Validar ENV
  const env = {
    VAPID_PUBLIC_KEY: !!publicKey,
    VAPID_PRIVATE_KEY: !!privateKey,
    VAPID_SUBJECT: !!process.env.VAPID_SUBJECT,
    CRON_SECRET: !!process.env.CRON_SECRET,
  }

  // Listar suscripciones de TODOS los socios activos
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, profile_id, user_agent, created_at')
    .order('created_at', { ascending: false })

  // Mapear a profile names
  const profileIds = Array.from(new Set((subs ?? []).map((s) => s.profile_id)))
  const { data: profiles } = await admin.from('profiles').select('id, nombre').in('id', profileIds)
  const nombrePorId = new Map((profiles ?? []).map((p) => [p.id, p.nombre]))

  // Si el caller envía { mandar_prueba: true }, manda un push a cada una
  let body: { mandar_prueba?: boolean } = {}
  try { body = await req.json() } catch {}

  const resultados: Array<Record<string, unknown>> = []
  const eliminar: string[] = []

  for (const s of subs ?? []) {
    const proveedor = s.endpoint.includes('web.push.apple.com')
      ? 'Apple iOS'
      : s.endpoint.includes('fcm.googleapis.com')
        ? 'Google FCM'
        : s.endpoint.includes('updates.push.services.mozilla.com')
          ? 'Mozilla'
          : 'Otro'
    const r: Record<string, unknown> = {
      id: s.id,
      socio: nombrePorId.get(s.profile_id) || s.profile_id.slice(0, 8),
      proveedor,
      endpoint_corto: s.endpoint.slice(-40),
      user_agent: s.user_agent || '—',
      creada: s.created_at,
    }

    if (body.mandar_prueba) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            title: '🧪 Test desde Cabo Admin',
            body: `Diagnóstico ${new Date().toLocaleTimeString('es-MX')} — si ves esto, FUNCIONA babys 🚀`,
            url: '/config',
            tag: 'debug-test',
          }),
          { TTL: 60 }
        )
        r.resultado = 'OK · push enviado'
      } catch (e: unknown) {
        const err = e as { statusCode?: number; body?: string; message?: string }
        r.resultado = `❌ ${err.statusCode ?? '?'} · ${err.body ?? err.message ?? 'sin detalle'}`
        if (err.statusCode === 404 || err.statusCode === 410) {
          eliminar.push(s.id)
          r.accion = 'borrada (inválida)'
        }
      }
    }

    resultados.push(r)
  }

  if (eliminar.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', eliminar)
  }

  return NextResponse.json({
    ok: true,
    env,
    total_suscripciones: subs?.length ?? 0,
    suscripciones: resultados,
    eliminadas: eliminar.length,
  })
}
