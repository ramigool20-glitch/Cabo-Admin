import { createAdminClient } from '@/lib/supabase/admin'
import { enviarPushAProfiles } from '@/lib/push/server'

export type MensajeAuditor = {
  title: string
  body: string
  url?: string
}

/**
 * Envía un mensaje aleatorio de un array a todos los socios suscritos.
 * Registra el envío en notificaciones_programadas para histórico.
 */
export async function enviarMensajeRandom(
  mensajes: MensajeAuditor[],
  tag: string
) {
  const admin = createAdminClient()

  // Obtener socios activos
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

  if (destinatarios.length === 0) {
    return { error: 'Sin socios activos', enviados: 0 }
  }

  // Pick mensaje aleatorio
  const m = mensajes[Math.floor(Math.random() * mensajes.length)]

  const result = await enviarPushAProfiles(destinatarios, {
    title: m.title,
    body: m.body,
    url: m.url ?? '/dashboard',
    tag,
  })

  // Registrar para histórico
  await admin.from('notificaciones_programadas').insert({
    tipo: 'auditor',
    titulo: m.title,
    mensaje: m.body,
    fecha_disparo: new Date().toISOString(),
    destinatarios,
    enviada: true,
    enviada_at: new Date().toISOString(),
    ref_tabla: 'auditor',
  })

  return result
}
