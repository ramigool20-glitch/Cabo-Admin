/**
 * Cron cada minuto (Vercel Pro): dispara push_scheduled con fire_at <= ahora.
 * Antes esto solo se disparaba cuando alguien abría la app.
 * Ahora corre en cron real, llegan las push aunque la app esté cerrada.
 */
import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { dispararPushesProgramados } from '@/lib/push/scheduler'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await dispararPushesProgramados()
  return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() })
}
