import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { enviarMensajeRandom } from '@/lib/cron/enviar-mensaje-equipo'

export const runtime = 'nodejs'

const MENSAJES = [
  {
    title: '🤖 JUIIIII equipitooo',
    body: 'Delta activados babys 🚀 ¿Qué dicen los nenes? Hay $ por ganar hoy.',
  },
  {
    title: '☀️ Buenos días equipo',
    body: 'Cabo despierta, los números también 📈 Mete la primera del día.',
  },
  {
    title: '🤖 Equipo deltaaa',
    body: 'Si capturan en caliente, yo les hago la chamba en la noche 😎',
  },
  {
    title: '🌊 ¡Arriba Cabo!',
    body: 'Pónganme tickets, ventas, notas de voz. Estoy listo babys.',
  },
  {
    title: '🤖 Auditor IA reportando',
    body: 'Llevan 0 capturas hoy. Vamos a cambiar eso. 💪',
  },
]

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const r = await enviarMensajeRandom(MENSAJES, 'saludo-manana')
  return NextResponse.json({ ok: true, ...r })
}
