/**
 * Cron motivacional: manda push de saludos/frases estoicas/gym/equipo a
 * horas variadas del día. SOLO push (no se guarda en el feed del Auditor).
 */
import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { enviarMensajeRandom } from '@/lib/cron/enviar-mensaje-equipo'
import { generarMensajeMotivacional } from '@/lib/cron/motivacional'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Hora de Cabo (UTC-7) para escoger el tono
  const hourCabo = (new Date().getUTCHours() - 7 + 24) % 24
  const msg = await generarMensajeMotivacional(hourCabo)
  const r = await enviarMensajeRandom([msg], 'motivacional')
  return NextResponse.json({ ok: true, ...msg, ...r })
}
