import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const ahora = new Date().toISOString()

  // 1) Encontrar tareas con fecha_limite pasada que sigan pendientes/en_progreso
  const { data: tareasVencidas, error } = await admin
    .from('tareas')
    .select('id, titulo, asignada_a, multa_monto, moneda_multa, fecha_limite')
    .lt('fecha_limite', ahora)
    .in('estado', ['pendiente', 'en_progreso'])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let vencidas = 0
  let multasCreadas = 0

  for (const t of tareasVencidas ?? []) {
    // Marcar como vencida
    await admin.from('tareas').update({ estado: 'vencida' }).eq('id', t.id)
    vencidas++

    // Si tiene multa configurada, crear multa con estado 'propuesta' para cada asignada_a
    if (t.multa_monto && Number(t.multa_monto) > 0) {
      const responder_antes = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      for (const responsableId of (t.asignada_a ?? []) as string[]) {
        // Dedup: ya existe multa para esta tarea y responsable?
        const { data: existente } = await admin
          .from('multas')
          .select('id')
          .eq('tarea_id', t.id)
          .eq('responsable_id', responsableId)
          .maybeSingle()
        if (existente) continue

        const { error: mErr } = await admin.from('multas').insert({
          tarea_id: t.id,
          responsable_id: responsableId,
          monto_propuesto: t.multa_monto,
          moneda: t.moneda_multa || 'MXN',
          motivo: `Tarea no completada a tiempo: ${t.titulo}`,
          estado: 'propuesta',
          responder_antes_de: responder_antes,
        })
        if (!mErr) multasCreadas++
      }
    }
  }

  return NextResponse.json({
    ok: true,
    procesadas: tareasVencidas?.length ?? 0,
    marcadas_vencidas: vencidas,
    multas_creadas: multasCreadas,
  })
}
