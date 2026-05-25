import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { enviarPushAProfiles } from '@/lib/push/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const ahora = new Date().toISOString()

  const { data: pendientes, error } = await admin
    .from('notificaciones_programadas')
    .select('id, tipo, titulo, mensaje, destinatarios, ref_tabla, ref_id, data')
    .eq('enviada', false)
    .lte('fecha_disparo', ahora)
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let enviados = 0
  let fallidos = 0

  for (const n of pendientes ?? []) {
    const refData = (n.data ?? {}) as Record<string, unknown>
    let url = '/dashboard'
    if (n.ref_tabla === 'empleado_compensacion') url = '/nomina'
    else if (n.ref_tabla === 'gastos_recurrentes') url = `/recurrentes/${n.ref_id}`
    else if (n.ref_tabla === 'tareas') url = '/tareas'
    else if (n.ref_tabla === 'multas') url = '/multas'

    const result = await enviarPushAProfiles(n.destinatarios as string[], {
      title: n.titulo,
      body: n.mensaje,
      url,
      tag: `${n.tipo}-${n.ref_id ?? n.id}`,
      data: refData,
    })

    enviados += result.enviados
    fallidos += result.fallidos

    await admin
      .from('notificaciones_programadas')
      .update({ enviada: true, enviada_at: new Date().toISOString() })
      .eq('id', n.id)
  }

  return NextResponse.json({
    ok: true,
    procesadas: pendientes?.length ?? 0,
    enviados,
    fallidos,
  })
}
