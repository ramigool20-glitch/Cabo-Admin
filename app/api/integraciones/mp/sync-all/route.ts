/**
 * POST /api/integraciones/mp/sync-all
 *
 * Sincroniza pagos MP de todas las integraciones activas. Pensado para
 * dispararse desde el layout cuando el usuario abre la app — con debounce
 * en cliente (>2 min desde el último sync). Es complemento al cron.
 *
 * Auth: usuario logueado (no requiere CRON_SECRET).
 * Body: opcional, sin parámetros.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sincronizarPagosMP, refrescarSaldoIntegracion } from '@/lib/integraciones/mercadopago'
import { logWebhook } from '@/lib/integraciones/webhook-log'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const t0 = Date.now()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createAdminClient()
  let integraciones: { id: string }[] = []
  try {
    const { data } = await admin.from('integraciones_mp').select('id').eq('activa', true)
    integraciones = data ?? []
  } catch {
    return NextResponse.json({ ok: true, integraciones: 0, creadas: 0 })
  }

  let totalCreadas = 0
  const errores: string[] = []

  for (const i of integraciones) {
    const r = await sincronizarPagosMP(i.id)
    totalCreadas += r.creadas
    if (r.error) errores.push(`sync ${i.id}: ${r.error}`)
    // Saldo lo refrescamos también de paso, no cuesta mucho
    refrescarSaldoIntegracion(i.id).catch(() => {})
  }

  const resp = {
    ok: true,
    integraciones: integraciones.length,
    creadas: totalCreadas,
    errores,
  }

  await logWebhook({
    fuente: 'auto_sync',
    ok: errores.length === 0,
    http_method: 'POST',
    request_url: req.url,
    resultado: resp,
    error: errores.length > 0 ? errores.join(' || ').slice(0, 500) : null,
    duracion_ms: Date.now() - t0,
  })

  return NextResponse.json(resp)
}
