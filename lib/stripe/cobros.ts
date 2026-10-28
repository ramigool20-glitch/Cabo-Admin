/**
 * Lógica compartida de cobros Stripe: marca un cobro como pagado (crea ingreso,
 * actualiza estado, manda push de festejo) y reconcilia los pendientes contra
 * la API de Stripe (fallback por si el webhook no llega).
 */
import { stripe } from './client'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'
import { aMxnEquivalente } from '@/lib/fx/server'
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

  const fechaHoy = hoyEnCabos()
  const fx = await aMxnEquivalente(Number(cobro.monto), cobro.moneda, fechaHoy)
  const { data, error } = await admin.rpc('contabilizar_stripe_atomico', { p: {
    id: cobro.id, payment_intent: paymentIntentId, fecha: fechaHoy,
    equivalente: fx.monto_mxn_equivalente, tasa: fx.tipo_cambio_usado,
  } })
  if (error) throw new Error(`No se contabilizó el cobro Stripe: ${error.message}`)
  if (!data?.creada) return false

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
    .in('estado', ['pendiente', 'cobrado']).is('transaccion_id', null)
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
