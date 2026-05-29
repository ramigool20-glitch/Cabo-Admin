/**
 * Cron: reconcilia cobros Stripe pendientes contra la API de Stripe.
 * Respaldo del webhook: si un link ya se pagó, lo marca cobrado, crea el
 * ingreso y manda push de festejo. Actualización casi al instante.
 */
import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { reconciliarCobrosStripe } from '@/lib/stripe/cobros'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await reconciliarCobrosStripe()
  return NextResponse.json({ ok: true, ...r })
}
