import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { enviarMensajeRandom } from '@/lib/cron/enviar-mensaje-equipo'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Mensajes contextuales: si llevan poco capturado, regaño suave
  const admin = createAdminClient()
  const hoy = hoyEnCabos()
  const { count: nTxHoy } = await admin
    .from('transacciones')
    .select('id', { count: 'exact', head: true })
    .eq('fecha', hoy)

  const mensajes = (nTxHoy ?? 0) < 3
    ? [
        { title: '🤖 ¿Y los movimientos?', body: `Solo ${nTxHoy ?? 0} captura(s) hoy. Pónganse las pilas equipo 💪` },
        { title: '🕒 Check del Auditor', body: `Mediodía y casi sin datos. ¿Necesitan que les ayude? Ya saben dónde estoy.` },
        { title: '👀 Auditor IA al rato', body: `Veo el dashboard con polvo. Métanle al chat de captura, va rápido.` },
      ]
    : [
        { title: '🔥 Vaaamos equipo', body: `${nTxHoy} capturas hoy ya. Sigan así, yo voy contando.` },
        { title: '🤖 Reporte parcial', body: `Hoy llevan ${nTxHoy} transacciones registradas. Bien!` },
        { title: '🎯 Buen ritmo', body: `${nTxHoy} movimientos. Si falta algo del corte, métanlo ya 📋` },
      ]

  const r = await enviarMensajeRandom(mensajes, 'check-tarde')
  return NextResponse.json({ ok: true, txHoy: nTxHoy, ...r })
}
