import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { enviarMensajeRandom } from '@/lib/cron/enviar-mensaje-equipo'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'
import { totalizar } from '@/lib/agregaciones'
import { formatMoney } from '@/lib/utils'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resumen del día
  const admin = createAdminClient()
  const hoy = hoyEnCabos()
  const { data: tx } = await admin
    .from('transacciones')
    .select('tipo, monto, moneda, fecha, categoria, negocio_id')
    .eq('fecha', hoy)

  const t = totalizar(tx ?? [])
  const totalDia = `Ingresos ${formatMoney(t.ingresos_mxn, 'MXN')} · Gastos ${formatMoney(t.gastos_mxn, 'MXN')}`

  const mensajes = [
    {
      title: '🌙 Cierre del día',
      body: `${totalDia}. Descansen babys, yo me quedo cuidando 💤`,
    },
    {
      title: '🤖 Auditor cerrando',
      body: `Hoy: ${totalDia}. Mañana otro round 🚀`,
    },
    {
      title: '✨ Buenas noches equipo',
      body: `Cerramos con: ${totalDia}. Sigan brillando, descansen 🌊`,
    },
  ]

  const r = await enviarMensajeRandom(mensajes, 'cierre-noche')
  return NextResponse.json({ ok: true, ...r })
}
