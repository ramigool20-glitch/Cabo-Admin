/**
 * Endpoint para mandar 1 push inmediato + programar N más con intervalo.
 * Llamado desde /config (botón "Mandar ráfaga de prueba").
 */
import { NextResponse } from 'next/server'
import { requireSocio } from '@/lib/auth/require-socio'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarPushAProfiles } from '@/lib/push/server'
import { programarPushes } from '@/lib/push/scheduler'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const g = await requireSocio()
  if (g instanceof NextResponse) return g
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Parse opts: { profileIds?, count?, intervaloMin? }
  let body: { profileIds?: string[]; count?: number; intervaloMin?: number; title?: string; mensaje?: string } = {}
  try { body = await req.json() } catch {}

  const intervaloMin = body.intervaloMin ?? 15
  const count = body.count ?? 3
  const titulo = body.title ?? '🛰️ Cabo Admin'
  const mensaje = body.mensaje ?? 'Notificación de prueba programada — el sistema está activo'

  // Si no especifica profileIds, manda al usuario actual + socios activos
  let destinatarios = body.profileIds
  if (!destinatarios || destinatarios.length === 0) {
    const admin = createAdminClient()
    const { data: socios } = await admin
      .from('profiles')
      .select('id, role_id, roles(nombre)')
      .eq('activo', true)
    destinatarios = (socios ?? [])
      .filter((p) => {
        const r = p.roles as unknown as { nombre: string } | null
        return r?.nombre === 'admin' || r?.nombre === 'socio'
      })
      .map((p) => p.id)
  }

  if (destinatarios.length === 0) {
    return NextResponse.json({ ok: false, error: 'No hay destinatarios' })
  }

  // 1) Push inmediato
  let inmediato = { enviados: 0, fallidos: 0 }
  try {
    inmediato = await enviarPushAProfiles(destinatarios, {
      title: titulo,
      body: `${mensaje} (1/${count + 1})`,
      url: '/dashboard',
      tag: 'burst-inmediato',
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'fail' })
  }

  // 2) Programar los siguientes 3 (o N) cada 15 min
  const delays: number[] = []
  for (let i = 1; i <= count; i++) delays.push(i * intervaloMin)
  const prog = await programarPushes({
    profile_ids: destinatarios,
    title: titulo,
    body: mensaje,
    delays_minutos: delays,
    tag: 'burst-scheduled',
  })

  return NextResponse.json({
    ok: true,
    inmediato_enviados: inmediato.enviados,
    inmediato_fallidos: inmediato.fallidos,
    programados: prog.programados,
    intervalo_min: intervaloMin,
    error_programados: prog.error,
  })
}
