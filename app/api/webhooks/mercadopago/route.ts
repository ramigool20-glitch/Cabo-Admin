/**
 * Webhook de Mercado Pago. MP llama aquí cuando hay un pago (incluyendo
 * cobros de Terminal Point). Identificamos la integración por query param
 * ?integ=<id> en la URL del webhook, y procesamos el pago.
 *
 * URL a configurar en MP por cuenta:
 *   https://cabo-admin.vercel.app/api/webhooks/mercadopago?integ=<integracion_id>
 */
import { NextResponse } from 'next/server'
import { procesarPagoMP } from '@/lib/integraciones/mercadopago'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: Request) {
  const url = new URL(req.url)
  const integ = url.searchParams.get('integ')

  let body: { type?: string; action?: string; data?: { id?: string } } = {}
  try { body = await req.json() } catch {}

  // MP manda notificaciones de tipo "payment"
  const tipo = body.type || url.searchParams.get('type')
  const paymentId = body.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id')

  // Responder 200 rápido siempre (MP reintenta si no)
  if (!integ || !paymentId || (tipo && tipo !== 'payment')) {
    return NextResponse.json({ received: true, skip: true })
  }

  try {
    const r = await procesarPagoMP(String(paymentId), integ)
    return NextResponse.json({ received: true, ...r })
  } catch (e) {
    // Igual respondemos 200 para que MP no reintente infinito; logueamos el error
    console.error('MP webhook error:', e)
    return NextResponse.json({ received: true, error: 'procesado con error' })
  }
}

// MP a veces hace GET para validar la URL
export async function GET() {
  return NextResponse.json({ ok: true, service: 'mercadopago-webhook' })
}
