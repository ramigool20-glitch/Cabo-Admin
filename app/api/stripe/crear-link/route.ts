import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { customAlphabet } from 'nanoid'
import { stripe } from '@/lib/stripe/client'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const nanoCode = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz', 7)

export const runtime = 'nodejs'
export const maxDuration = 30

type Body = {
  negocio_id?: string | null
  cliente_nombre?: string | null
  cliente_email?: string | null
  cliente_telefono?: string | null
  descripcion: string
  monto: number              // en unidad mayor (USD o MXN) — convertimos a centavos
  moneda: 'MXN' | 'USD'
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const body = (await req.json()) as Body
    if (!body.descripcion || !body.monto || body.monto <= 0) {
      return NextResponse.json({ error: 'Falta descripción o monto válido' }, { status: 400 })
    }

    const moneda = body.moneda === 'MXN' ? 'mxn' : 'usd'
    const montoCentavos = Math.round(body.monto * 100)

    // Derivar origen del request (para success_url y cancel_url)
    const origin =
      req.headers.get('origin') ||
      `https://${req.headers.get('host') || 'cabo-admin.vercel.app'}`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: moneda,
            product_data: { name: body.descripcion },
            unit_amount: montoCentavos,
          },
          quantity: 1,
        },
      ],
      customer_email: body.cliente_email || undefined,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24h
      success_url: `${origin}/cobros?paid=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cobros?canceled=true`,
      metadata: {
        negocio_id: body.negocio_id || '',
        cliente_nombre: body.cliente_nombre || '',
        cliente_telefono: body.cliente_telefono || '',
        creado_por: user.id,
      },
    })

    const paymentUrl = session.url || ''

    // Generar short_code único (7 chars alfanuméricos)
    const shortCode = nanoCode()
    const shortUrl = `${origin}/p/${shortCode}`

    // El QR apunta al SHORT URL, no al Stripe URL completo
    const qrDataUrl = shortUrl
      ? await QRCode.toDataURL(shortUrl, { width: 400, margin: 1, color: { dark: '#000', light: '#FFF' } })
      : null

    // Guardar en BD
    const admin = createAdminClient()
    const { data: cobro, error } = await admin
      .from('cobros_stripe')
      .insert({
        negocio_id: body.negocio_id || null,
        cliente_nombre: body.cliente_nombre || null,
        cliente_email: body.cliente_email || null,
        cliente_telefono: body.cliente_telefono || null,
        descripcion: body.descripcion,
        monto: body.monto,
        moneda: body.moneda,
        estado: 'pendiente',
        stripe_session_id: session.id,
        payment_url: paymentUrl,
        qr_url: qrDataUrl,
        short_code: shortCode,
        expira_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
        creado_por: user.id,
      })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      id: cobro?.id,
      payment_url: shortUrl,         // entregamos el corto para compartir
      stripe_url: paymentUrl,        // por si quieren el largo
      qr_url: qrDataUrl,
      session_id: session.id,
      short_code: shortCode,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
