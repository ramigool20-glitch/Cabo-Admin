/**
 * Mercado Pago — procesa cobros de Terminal Point (y otros) automáticamente.
 * Cuando MP notifica un pago, buscamos el detalle con el access_token de esa
 * cuenta y creamos una transacción de ingreso ligada.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { aMxnEquivalente } from '@/lib/fx/server'

type MPPayment = {
  id: number
  status: string                 // approved, pending, rejected, refunded, cancelled
  transaction_amount: number
  currency_id: string            // MXN, USD
  date_approved: string | null
  date_created: string
  description: string | null
  payment_method_id: string | null
  point_of_interaction?: {
    type?: string
    business_info?: { unit?: string; sub_unit?: string }
  }
  external_reference?: string | null
}

/**
 * Valida un access token contra MP y devuelve el user_id.
 */
export async function validarTokenMP(accessToken: string): Promise<{ ok: boolean; userId?: string; error?: string }> {
  try {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      return { ok: false, error: `MP respondió ${res.status}` }
    }
    const data = await res.json()
    return { ok: true, userId: String(data.id) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error red MP' }
  }
}

/**
 * Procesa un pago de MP: lo busca, valida, y crea la transacción.
 * Idempotente: si ya está en mp_pagos_procesados, no duplica.
 */
export async function procesarPagoMP(
  paymentId: string,
  integracionId: string
): Promise<{ ok: boolean; creada: boolean; error?: string }> {
  const admin = createAdminClient()

  // ¿Ya procesado?
  const { data: yaProc } = await admin
    .from('mp_pagos_procesados')
    .select('id')
    .eq('mp_payment_id', paymentId)
    .maybeSingle()
  if (yaProc) return { ok: true, creada: false }

  // Config de la integración
  const { data: integ } = await admin
    .from('integraciones_mp')
    .select('*')
    .eq('id', integracionId)
    .single()
  if (!integ || !integ.activa) return { ok: false, creada: false, error: 'Integración no activa' }

  // Buscar detalle del pago en MP
  let pago: MPPayment
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${integ.access_token}` },
    })
    if (!res.ok) return { ok: false, creada: false, error: `MP payment ${res.status}` }
    pago = await res.json()
  } catch (e) {
    return { ok: false, creada: false, error: e instanceof Error ? e.message : 'Error MP' }
  }

  // Solo procesamos pagos aprobados
  if (pago.status !== 'approved') {
    // Registramos que lo vimos pero no creamos tx
    await admin.from('mp_pagos_procesados').insert({
      mp_payment_id: paymentId,
      integracion_id: integracionId,
      monto: pago.transaction_amount,
      moneda: pago.currency_id,
      estado: pago.status,
    })
    return { ok: true, creada: false }
  }

  const moneda = (pago.currency_id === 'USD' ? 'USD' : 'MXN') as 'MXN' | 'USD'
  const fecha = (pago.date_approved || pago.date_created).slice(0, 10)
  const fx = await aMxnEquivalente(pago.transaction_amount, moneda, fecha)

  const concepto = pago.description
    || `Cobro MP Point${pago.payment_method_id ? ` (${pago.payment_method_id})` : ''}`

  // Crear la transacción de ingreso
  const { data: tx, error: txErr } = await admin
    .from('transacciones')
    .insert({
      tipo: 'ingreso',
      monto: pago.transaction_amount,
      moneda,
      monto_mxn_equivalente: fx.monto_mxn_equivalente,
      tipo_cambio_usado: fx.tipo_cambio_usado,
      fecha,
      negocio_id: integ.negocio_default_id,
      cuenta_id: integ.cuenta_id,
      categoria: 'ventas',
      concepto,
      metodo_pago: 'mp_terminal',
      metodo_captura: 'api',
      notas: `Importado automático de Mercado Pago (payment ${paymentId})`,
    })
    .select('id')
    .single()

  if (txErr) return { ok: false, creada: false, error: txErr.message }

  // Registrar como procesado
  await admin.from('mp_pagos_procesados').insert({
    mp_payment_id: paymentId,
    integracion_id: integracionId,
    transaccion_id: tx?.id ?? null,
    monto: pago.transaction_amount,
    moneda,
    estado: pago.status,
  })

  // Actualizar contador + last sync
  await admin
    .from('integraciones_mp')
    .update({ ultimo_sync: new Date().toISOString(), cobros_count: (integ.cobros_count ?? 0) + 1 })
    .eq('id', integracionId)

  return { ok: true, creada: true }
}

/**
 * Poll de respaldo: busca pagos recientes de una integración (por si un webhook se perdió).
 */
export async function sincronizarPagosMP(integracionId: string): Promise<{ creadas: number; error?: string }> {
  const admin = createAdminClient()
  const { data: integ } = await admin
    .from('integraciones_mp')
    .select('*')
    .eq('id', integracionId)
    .single()
  if (!integ || !integ.activa) return { creadas: 0, error: 'Integración no activa' }

  // Pagos de las últimas 48h
  const desde = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  try {
    const url = `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&range=date_created&begin_date=${desde}&end_date=NOW&limit=50`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${integ.access_token}` },
    })
    if (!res.ok) return { creadas: 0, error: `MP search ${res.status}` }
    const data = await res.json()
    const pagos = (data.results ?? []) as MPPayment[]
    let creadas = 0
    for (const p of pagos) {
      const r = await procesarPagoMP(String(p.id), integracionId)
      if (r.creada) creadas++
    }
    return { creadas }
  } catch (e) {
    return { creadas: 0, error: e instanceof Error ? e.message : 'Error MP' }
  }
}
