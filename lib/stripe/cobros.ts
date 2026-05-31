/**
 * Lógica compartida de cobros Stripe: marca un cobro como pagado (crea ingreso,
 * actualiza estado, manda push de festejo) y reconcilia los pendientes contra
 * la API de Stripe (fallback por si el webhook no llega).
 */
import { stripe } from './client'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'
import { aMxnEquivalente } from '@/lib/fx/server'
import { registrarHistorial } from '@/lib/historial'
import { enviarPushAProfiles } from '@/lib/push/server'
import { formatMoney } from '@/lib/utils'

type CobroRow = {
  id: string
  monto: number | string
  moneda: 'MXN' | 'USD'
  descripcion: string
  cliente_nombre: string | null
  negocio_id: string | null
  creado_por: string | null
  estado: string
}

/**
 * Marca un cobro como pagado: crea el ingreso, actualiza el estado y (opcional)
 * manda push. Devuelve true si lo procesó (false si ya estaba cobrado).
 */
export async function procesarCobroPagado(
  cobro: CobroRow,
  paymentIntentId: string | null,
  opts: { push?: boolean } = {}
): Promise<boolean> {
  const admin = createAdminClient()

  // ATÓMICO: solo procesa si logra marcarlo cobrado desde 'pendiente'.
  // Si dos webhooks llegan en paralelo (retry de Stripe), solo uno gana
  // y el otro se queda sin hacer nada (evita doble transacción).
  const { data: claimed } = await admin
    .from('cobros_stripe')
    .update({
      estado: 'cobrado',
      cobrado_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq('id', cobro.id)
    .eq('estado', 'pendiente')
    .select('id')
  if (!claimed || claimed.length === 0) return false

  const fechaHoy = hoyEnCabos()
  const fx = await aMxnEquivalente(Number(cobro.monto), cobro.moneda, fechaHoy)

  const txInsert = {
    tipo: 'ingreso' as const,
    monto: cobro.monto,
    moneda: cobro.moneda,
    monto_mxn_equivalente: fx.monto_mxn_equivalente,
    tipo_cambio_usado: fx.tipo_cambio_usado,
    fecha: fechaHoy,
    concepto: cobro.descripcion + (cobro.cliente_nombre ? ` - ${cobro.cliente_nombre}` : ''),
    negocio_id: cobro.negocio_id || null,
    categoria: 'stripe',
    metodo_captura: 'api' as const,
    metodo_pago: 'stripe' as const,
    capturado_por: cobro.creado_por,
    raw_ai_response: { stripe_payment_intent_id: paymentIntentId },
  }
  const { data: tx } = await admin.from('transacciones').insert(txInsert).select('id').single()

  if (tx?.id) {
    await admin.from('cobros_stripe').update({ transaccion_id: tx.id }).eq('id', cobro.id)
    if (cobro.creado_por) {
      await registrarHistorial(tx.id, 'creada', cobro.creado_por, null, txInsert)
    }
  }

  if (opts.push) {
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
        const cliente = cobro.cliente_nombre ? ` de ${cobro.cliente_nombre}` : ''
        await enviarPushAProfiles(destinatarios, {
          title: '🤑💸 ¡Pagaron tu link!',
          body: `🎉 Entró ${formatMoney(Number(cobro.monto), cobro.moneda)}${cliente} · ${cobro.descripcion} 🥳🚀`,
          url: '/cobros',
          tag: `stripe-paid-${cobro.id}`,
          data: { prioridad: 'alta' },
        })
      }
    } catch { /* no bloquear por push */ }
  }

  return true
}

/**
 * Revisa todos los cobros pendientes contra Stripe y procesa los que ya
 * fueron pagados. Sirve como respaldo del webhook (actualización casi al instante).
 */
export async function reconciliarCobrosStripe(): Promise<{ revisados: number; pagados: number }> {
  const admin = createAdminClient()
  const { data: pend } = await admin
    .from('cobros_stripe')
    .select('*')
    .eq('estado', 'pendiente')
    .not('stripe_session_id', 'is', null)

  let revisados = 0
  let pagados = 0
  for (const c of (pend ?? []) as (CobroRow & { stripe_session_id: string })[]) {
    revisados++
    try {
      const session = await stripe.checkout.sessions.retrieve(c.stripe_session_id)
      if (session.payment_status === 'paid') {
        const pi = typeof session.payment_intent === 'string' ? session.payment_intent : null
        const done = await procesarCobroPagado(c, pi, { push: true })
        if (done) pagados++
      } else if (session.status === 'expired') {
        await admin.from('cobros_stripe').update({ estado: 'expirado' }).eq('id', c.id).neq('estado', 'cobrado')
      }
    } catch { /* sesión no encontrada / error transitorio */ }
  }
  return { revisados, pagados }
}
