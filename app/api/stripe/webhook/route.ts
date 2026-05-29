import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { procesarCobroPagado } from '@/lib/stripe/cobros'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: Request) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'No signature' }, { status: 400 })

  if (!STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook secret no configurado' }, { status: 500 })
  }

  const body = await req.text()
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid signature'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const admin = createAdminClient()

  // Eventos que nos interesan
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session

    // Buscar el cobro en BD
    const { data: cobro } = await admin
      .from('cobros_stripe')
      .select('*')
      .eq('stripe_session_id', session.id)
      .single()

    if (cobro && cobro.estado !== 'cobrado') {
      const pi = typeof session.payment_intent === 'string' ? session.payment_intent : null
      await procesarCobroPagado(cobro, pi, { push: true })
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session
    await admin
      .from('cobros_stripe')
      .update({ estado: 'expirado' })
      .eq('stripe_session_id', session.id)
      .neq('estado', 'cobrado')
  }

  return NextResponse.json({ received: true })
}
