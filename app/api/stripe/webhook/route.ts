import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'
import { aMxnEquivalente } from '@/lib/fx/server'
import { registrarHistorial } from '@/lib/historial'
import { enviarPushAProfiles } from '@/lib/push/server'
import { formatMoney } from '@/lib/utils'

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
      // Crear transacción ingreso (con FX MXN equivalente)
      const metadata = session.metadata || {}
      const fechaHoy = hoyEnCabos()
      const fx = await aMxnEquivalente(Number(cobro.monto), cobro.moneda as 'MXN' | 'USD', fechaHoy)
      const txInsert = {
        tipo: 'ingreso',
        monto: cobro.monto,
        moneda: cobro.moneda,
        monto_mxn_equivalente: fx.monto_mxn_equivalente,
        tipo_cambio_usado: fx.tipo_cambio_usado,
        fecha: fechaHoy,
        concepto: cobro.descripcion + (cobro.cliente_nombre ? ` - ${cobro.cliente_nombre}` : ''),
        negocio_id: cobro.negocio_id || metadata.negocio_id || null,
        categoria: 'stripe',
        metodo_captura: 'api',
        metodo_pago: 'stripe',
        capturado_por: cobro.creado_por,
        raw_ai_response: { stripe_session_id: session.id, stripe_payment_intent_id: session.payment_intent },
      }
      const { data: tx } = await admin
        .from('transacciones')
        .insert(txInsert)
        .select('id')
        .single()

      // Marcar como cobrado
      await admin
        .from('cobros_stripe')
        .update({
          estado: 'cobrado',
          cobrado_at: new Date().toISOString(),
          stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          transaccion_id: tx?.id ?? null,
        })
        .eq('id', cobro.id)

      // Historial
      if (tx?.id && cobro.creado_por) {
        await registrarHistorial(tx.id, 'creada', cobro.creado_por, null, txInsert)
      }

      // Push a TODOS los socios — alguien acaba de pagar
      try {
        const { data: socios } = await admin
          .from('profiles')
          .select('id, role_id, roles(nombre)')
          .eq('activo', true)
        const destinatarios = (socios ?? [])
          .filter((p) => {
            const r = p.roles as unknown as { nombre: string } | null
            return r?.nombre === 'admin' || r?.nombre === 'socio'
          })
          .map((p) => p.id)
        if (destinatarios.length > 0) {
          const clienteTxt = cobro.cliente_nombre ? ` de ${cobro.cliente_nombre}` : ''
          await enviarPushAProfiles(destinatarios, {
            title: '💰 ¡Pago recibido!',
            body: `${formatMoney(Number(cobro.monto), cobro.moneda as 'MXN' | 'USD')} via Stripe${clienteTxt} · ${cobro.descripcion}`,
            url: '/cobros',
            tag: `stripe-paid-${cobro.id}`,
            data: { prioridad: 'alta' },
          })
        }
      } catch {}
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
