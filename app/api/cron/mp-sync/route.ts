/**
 * Cron de respaldo: sincroniza pagos MP de todas las integraciones activas.
 * Por si algún webhook se perdió. Corre cada hora.
 */
import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sincronizarPagosMP } from '@/lib/integraciones/mercadopago'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  let integraciones: { id: string }[] = []
  try {
    const { data } = await admin.from('integraciones_mp').select('id').eq('activa', true)
    integraciones = data ?? []
  } catch {
    return NextResponse.json({ ok: true, skip: 'tabla no existe' })
  }

  let totalCreadas = 0
  const errores: string[] = []
  for (const i of integraciones) {
    const r = await sincronizarPagosMP(i.id)
    totalCreadas += r.creadas
    if (r.error) errores.push(`${i.id}: ${r.error}`)
  }

  return NextResponse.json({ ok: true, integraciones: integraciones.length, creadas: totalCreadas, errores })
}
