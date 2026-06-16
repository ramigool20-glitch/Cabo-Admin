/**
 * Webhook de Mercado Pago. MP llama aquí cuando hay un pago (incluyendo
 * cobros de Terminal Point). Identificamos la integración por query param
 * ?integ=<id> en la URL del webhook, y procesamos el pago.
 *
 * URL a configurar en MP por cuenta:
 *   https://cabo-admin.vercel.app/api/webhooks/mercadopago?integ=<integracion_id>
 *
 * Valida firma con HMAC SHA-256 usando integraciones_mp.webhook_secret.
 * Si la firma es inválida, registra en webhook_log y devuelve 200 silencioso
 * (no rompe a MP).
 *
 * Cada request queda registrada en `webhook_log` para diagnóstico.
 */
import { NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { procesarPagoMP } from '@/lib/integraciones/mercadopago'
import { createAdminClient } from '@/lib/supabase/admin'
import { logWebhook } from '@/lib/integraciones/webhook-log'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Valida la firma X-Signature que MP manda. Formato del header:
 *   ts=1700000000,v1=<hex>
 * El v1 es HMAC-SHA256 sobre el "manifest":
 *   id:<dataId>;request-id:<xRequestId>;ts:<ts>;
 * Si falta secret en la integración → no validamos (true para no bloquear).
 */
function validarFirmaMP(opts: {
  secret: string | null
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
}): { valida: boolean; razon?: string } {
  if (!opts.secret) return { valida: true, razon: 'sin secret guardado' }
  if (!opts.xSignature || !opts.dataId) return { valida: false, razon: 'falta header o data.id' }

  const parts = Object.fromEntries(
    opts.xSignature.split(',').map((p) => {
      const [k, ...rest] = p.split('=')
      return [k.trim(), rest.join('=').trim()]
    })
  )
  const ts = parts['ts']
  const v1 = parts['v1']
  if (!ts || !v1) return { valida: false, razon: 'formato de signature inválido' }

  const manifest = `id:${opts.dataId};request-id:${opts.xRequestId ?? ''};ts:${ts};`
  const expected = createHmac('sha256', opts.secret).update(manifest).digest('hex')

  return v1 === expected ? { valida: true } : { valida: false, razon: 'hmac no coincide' }
}

export async function POST(req: Request) {
  const t0 = Date.now()
  const url = new URL(req.url)
  const integ = url.searchParams.get('integ')
  const xSignature = req.headers.get('x-signature')
  const xRequestId = req.headers.get('x-request-id')

  let body: { type?: string; action?: string; data?: { id?: string } } = {}
  try { body = await req.json() } catch {}

  const tipo = body.type || url.searchParams.get('type')
  const paymentId = body.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id')

  // Validación de firma (best-effort: si falla, no procesa pero responde 200)
  let signatureValid: boolean | null = null
  if (integ) {
    const admin = createAdminClient()
    const { data: integRow } = await admin
      .from('integraciones_mp')
      .select('webhook_secret')
      .eq('id', integ)
      .maybeSingle()
    const r = validarFirmaMP({
      secret: integRow?.webhook_secret ?? null,
      xSignature,
      xRequestId,
      dataId: paymentId ? String(paymentId) : null,
    })
    signatureValid = r.valida

    // Si tenemos secret guardado Y la firma es inválida, NO procesamos
    if (integRow?.webhook_secret && !r.valida) {
      await logWebhook({
        fuente: 'webhook_mp',
        integracion_id: integ,
        status: 200,
        ok: false,
        http_method: 'POST',
        request_url: req.url,
        request_body: body,
        request_signature: xSignature,
        signature_valid: false,
        payment_id: paymentId ? String(paymentId) : null,
        payment_type: tipo,
        error: `firma inválida: ${r.razon}`,
        duracion_ms: Date.now() - t0,
      })
      return NextResponse.json({ received: true, skip: 'invalid signature' })
    }
  }

  // Skip si falta integ/payment o tipo distinto a payment
  if (!integ || !paymentId || (tipo && tipo !== 'payment')) {
    await logWebhook({
      fuente: 'webhook_mp',
      integracion_id: integ,
      status: 200,
      ok: true,
      http_method: 'POST',
      request_url: req.url,
      request_body: body,
      request_signature: xSignature,
      signature_valid: signatureValid,
      payment_id: paymentId ? String(paymentId) : null,
      payment_type: tipo,
      resultado: { skip: true, motivo: !integ ? 'sin integ' : !paymentId ? 'sin paymentId' : 'tipo distinto' },
      duracion_ms: Date.now() - t0,
    })
    return NextResponse.json({ received: true, skip: true })
  }

  try {
    const r = await procesarPagoMP(String(paymentId), integ)
    await logWebhook({
      fuente: 'webhook_mp',
      integracion_id: integ,
      status: 200,
      ok: r.ok,
      http_method: 'POST',
      request_url: req.url,
      request_body: body,
      request_signature: xSignature,
      signature_valid: signatureValid,
      payment_id: String(paymentId),
      payment_type: tipo,
      resultado: r,
      error: r.error,
      duracion_ms: Date.now() - t0,
    })
    return NextResponse.json({ received: true, ...r })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'error desconocido'
    await logWebhook({
      fuente: 'webhook_mp',
      integracion_id: integ,
      status: 200,
      ok: false,
      http_method: 'POST',
      request_url: req.url,
      request_body: body,
      request_signature: xSignature,
      signature_valid: signatureValid,
      payment_id: String(paymentId),
      payment_type: tipo,
      error: errMsg,
      duracion_ms: Date.now() - t0,
    })
    console.error('MP webhook error:', e)
    return NextResponse.json({ received: true, error: 'procesado con error' })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: 'mercadopago-webhook' })
}
