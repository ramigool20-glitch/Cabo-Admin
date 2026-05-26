import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

/**
 * Short URL redirect: /p/{code} → Stripe Checkout URL
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ code: string }> }
) {
  const { code } = await context.params
  if (!code || !/^[A-Za-z0-9]{6,12}$/.test(code)) {
    return new NextResponse('Link inválido', { status: 404 })
  }

  const admin = createAdminClient()
  const { data: cobro } = await admin
    .from('cobros_stripe')
    .select('payment_url, estado, expira_at')
    .eq('short_code', code)
    .maybeSingle()

  if (!cobro || !cobro.payment_url) {
    return new NextResponse('Link no encontrado o expirado', { status: 404 })
  }

  if (cobro.estado === 'cobrado') {
    return new NextResponse('Este pago ya fue cobrado.', { status: 410 })
  }

  if (cobro.estado === 'cancelado') {
    return new NextResponse('Este link de pago fue cancelado.', { status: 410 })
  }

  if (cobro.expira_at && new Date(cobro.expira_at) < new Date()) {
    return new NextResponse('Este link de pago expiró.', { status: 410 })
  }

  // Redirect al Stripe Checkout
  return NextResponse.redirect(cobro.payment_url, 302)
}
