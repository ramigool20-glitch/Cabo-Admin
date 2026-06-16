/**
 * Cron de respaldo: sincroniza pagos MP de todas las integraciones activas.
 * Por si algún webhook se perdió o si el pago no dispara webhook (típico
 * caso: transferencias bancarias entrantes, MP no manda webhook).
 * Corre cada 10 min.
 */
import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sincronizarPagosMP, refrescarSaldoIntegracion } from '@/lib/integraciones/mercadopago'
import { logWebhook } from '@/lib/integraciones/webhook-log'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(req: Request) {
  const t0 = Date.now()
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  let integraciones: { id: string }[] = []
  try {
    const { data } = await admin.from('integraciones_mp').select('id').eq('activa', true)
    integraciones = data ?? []
  } catch {
    await logWebhook({
      fuente: 'cron_mp_sync',
      ok: true,
      http_method: 'GET',
      request_url: req.url,
      resultado: { skip: 'tabla integraciones_mp no existe' },
      duracion_ms: Date.now() - t0,
    })
    return NextResponse.json({ ok: true, skip: 'tabla no existe' })
  }

  let totalCreadas = 0
  let saldosOk = 0
  const errores: string[] = []

  for (const i of integraciones) {
    const tI = Date.now()
    const r = await sincronizarPagosMP(i.id)
    totalCreadas += r.creadas
    if (r.error) errores.push(`sync ${i.id}: ${r.error}`)

    const s = await refrescarSaldoIntegracion(i.id)
    if (s.ok) saldosOk++
    else if (s.error) errores.push(`saldo ${i.id}: ${s.error}`)

    await logWebhook({
      fuente: 'cron_mp_sync_one',
      integracion_id: i.id,
      ok: !r.error && !s.error,
      resultado: { creadas: r.creadas, saldo_ok: s.ok },
      error: [r.error, s.error].filter(Boolean).join(' | ') || null,
      duracion_ms: Date.now() - tI,
    })
  }

  const resp = {
    ok: true,
    integraciones: integraciones.length,
    creadas: totalCreadas,
    saldos_ok: saldosOk,
    errores,
  }

  await logWebhook({
    fuente: 'cron_mp_sync',
    ok: errores.length === 0,
    http_method: 'GET',
    request_url: req.url,
    resultado: resp,
    error: errores.length > 0 ? errores.join(' || ').slice(0, 500) : null,
    duracion_ms: Date.now() - t0,
  })

  return NextResponse.json(resp)
}
