/**
 * Mercado Pago — procesa cobros de Terminal Point (y otros) automáticamente.
 * Cuando MP notifica un pago, buscamos el detalle con el access_token de esa
 * cuenta y creamos una transacción de ingreso ligada.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { aMxnEquivalente } from '@/lib/fx/server'
import { sugerirCategorizacion } from '@/lib/ai/sugerir-categorizacion'
import {
  crearPendienteCategorizacion,
  enviarPushCategorizacion,
} from '@/lib/integraciones/pregunta-categorizacion'

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

  // ── Detección de duplicados: ¿el usuario ya capturó esto manualmente? ──
  // Busca una tx no-api con mismo monto+cuenta+moneda+tipo dentro de ±2 días.
  // Si existe, NO duplicamos: la enlazamos en mp_pagos_procesados y salimos.
  const fechaMenos2 = new Date(new Date(fecha).getTime() - 2 * 86_400_000).toISOString().slice(0, 10)
  const fechaMas2 = new Date(new Date(fecha).getTime() + 2 * 86_400_000).toISOString().slice(0, 10)
  const { data: posibleDup } = await admin
    .from('transacciones')
    .select('id, fecha, concepto, metodo_captura')
    .eq('cuenta_id', integ.cuenta_id)
    .eq('tipo', 'ingreso')
    .eq('monto', pago.transaction_amount)
    .eq('moneda', moneda)
    .neq('metodo_captura', 'api')          // sólo tx que NO vinieron de MP
    .gte('fecha', fechaMenos2)
    .lte('fecha', fechaMas2)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (posibleDup) {
    // Enlazar como ya procesado para evitar duplicado y registrar la conexión
    await admin.from('mp_pagos_procesados').insert({
      mp_payment_id: paymentId,
      integracion_id: integracionId,
      transaccion_id: posibleDup.id,
      monto: pago.transaction_amount,
      moneda,
      estado: pago.status,
    })
    // Actualizar la tx manual con datos de MP (para conciliación)
    await admin
      .from('transacciones')
      .update({
        notas: `${posibleDup.concepto ?? ''}\n[Coincide con MP payment ${paymentId}]`.trim(),
      })
      .eq('id', posibleDup.id)
    await admin
      .from('integraciones_mp')
      .update({ ultimo_sync: new Date().toISOString() })
      .eq('id', integracionId)
    return { ok: true, creada: false }
  }

  // Categorización híbrida: consulta histórico+IA para sugerir negocio/categoría
  // según el concepto del cobro. 3 niveles de confianza:
  //   alta   → aplica la sugerencia, push silencioso
  //   media  → aplica la sugerencia pero pide verificar, push normal
  //   baja   → deja en blanco, push con botones para responder en 1 tap
  const sug = await sugerirCategorizacion(admin, {
    concepto,
    tipo: 'ingreso',
    monto: pago.transaction_amount,
  })

  const confianza = sug?.confianza ?? 'baja'

  const negocio_id =
    confianza === 'baja'
      ? null
      : sug?.negocio_id ?? integ.negocio_default_id
  const categoria =
    confianza === 'baja' ? null : sug?.categoria ?? null

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
      negocio_id,
      cuenta_id: integ.cuenta_id,
      categoria,
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

  // Sistema híbrido: pregunta / push según confianza. Best-effort, no rompe el flujo.
  if (tx?.id) {
    const txResumen = {
      id: tx.id,
      monto: pago.transaction_amount,
      moneda,
      concepto,
      fecha,
    }
    const integResumen = {
      id: integracionId,
      nombre: integ.nombre,
      cuenta_id: integ.cuenta_id,
      negocio_default_id: integ.negocio_default_id,
    }
    try {
      if (confianza === 'baja') {
        // Sin histórico — pregunta abierta, push con CTA
        await crearPendienteCategorizacion(admin, txResumen, sug, integResumen)
        await enviarPushCategorizacion(admin, txResumen, sug, integResumen, 'alta')
      } else if (confianza === 'media') {
        // Aplicó sugerencia pero conviene verificar
        await crearPendienteCategorizacion(admin, txResumen, sug, integResumen)
        await enviarPushCategorizacion(admin, txResumen, sug, integResumen, 'media')
      } else {
        // Confianza alta — push silencioso de "ya quedó"
        await enviarPushCategorizacion(admin, txResumen, sug, integResumen, 'baja')
      }
    } catch (e) {
      console.error('procesarPagoMP: push/pendiente falló', e)
    }
  }

  return { ok: true, creada: true }
}

/**
 * Obtiene el saldo de la cuenta MP con el access token. Devuelve
 * { disponible, pendiente, total, moneda } en la moneda principal de la cuenta.
 *
 * MP no expone uniformemente este endpoint. Probamos en orden:
 *   1) GET /v1/account/balance               (formato actual recomendado)
 *   2) GET /users/{mp_user_id}/mercadopago_account/balance (legacy)
 *   3) GET /users/me (algunos campos legacy: `mercadopago_balance`)
 *
 * Si todos fallan, devuelve { error } y dejamos el último error en la BD para
 * verlo en UI.
 */
export async function obtenerSaldoMP(
  accessToken: string,
  mpUserId?: string | null,
): Promise<{
  ok: boolean
  disponible?: number
  pendiente?: number
  total?: number
  moneda?: string
  error?: string
}> {
  const intentos: { url: string; pick: (j: Record<string, unknown>) => { disponible?: number; pendiente?: number; moneda?: string } | null }[] = [
    {
      url: 'https://api.mercadopago.com/v1/account/balance',
      pick: (j) => {
        // Formato común: { available_balance, unavailable_balance, total_amount, currency_id }
        if (typeof j.available_balance === 'number') {
          return {
            disponible: j.available_balance as number,
            pendiente: (j.unavailable_balance as number | undefined) ?? 0,
            moneda: (j.currency_id as string | undefined) ?? 'MXN',
          }
        }
        return null
      },
    },
    {
      url: mpUserId
        ? `https://api.mercadopago.com/users/${mpUserId}/mercadopago_account/balance`
        : '',
      pick: (j) => {
        // Formato legacy: { available_balance, unavailable_balance, total_amount }
        if (typeof j.available_balance === 'number') {
          return {
            disponible: j.available_balance as number,
            pendiente: (j.unavailable_balance as number | undefined) ?? 0,
            moneda: (j.currency_id as string | undefined) ?? 'MXN',
          }
        }
        return null
      },
    },
  ]

  let ultimoError = ''
  for (const intento of intentos) {
    if (!intento.url) continue
    try {
      const res = await fetch(intento.url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!res.ok) {
        ultimoError = `${intento.url.split('?')[0]} → ${res.status}`
        continue
      }
      const data = await res.json() as Record<string, unknown>
      const picked = intento.pick(data)
      if (picked && typeof picked.disponible === 'number') {
        const disp = picked.disponible
        const pend = picked.pendiente ?? 0
        return {
          ok: true,
          disponible: disp,
          pendiente: pend,
          total: Number((disp + pend).toFixed(2)),
          moneda: picked.moneda ?? 'MXN',
        }
      }
      ultimoError = `${intento.url.split('?')[0]} → respuesta sin balance`
    } catch (e) {
      ultimoError = e instanceof Error ? e.message : 'fetch error'
    }
  }

  return { ok: false, error: ultimoError || 'No se pudo obtener saldo' }
}

/**
 * Refresca el saldo guardado en BD para una integración. Si MP no respondió,
 * registra el error en saldo_error para diagnóstico.
 */
export async function refrescarSaldoIntegracion(integracionId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: integ } = await admin
    .from('integraciones_mp')
    .select('id, access_token, mp_user_id, activa')
    .eq('id', integracionId)
    .single()
  if (!integ || !integ.activa) return { ok: false, error: 'Integración no activa' }

  const r = await obtenerSaldoMP(integ.access_token, integ.mp_user_id)

  if (!r.ok) {
    await admin
      .from('integraciones_mp')
      .update({
        saldo_error: r.error ?? 'desconocido',
        saldo_actualizado_at: new Date().toISOString(),
      })
      .eq('id', integracionId)
    return { ok: false, error: r.error }
  }

  await admin
    .from('integraciones_mp')
    .update({
      saldo_disponible: r.disponible,
      saldo_pendiente: r.pendiente,
      saldo_total: r.total,
      saldo_moneda: r.moneda,
      saldo_actualizado_at: new Date().toISOString(),
      saldo_error: null,
    })
    .eq('id', integracionId)

  return { ok: true }
}

/**
 * Poll de respaldo: busca pagos recientes de una integración (por si un webhook se perdió).
 */
export async function sincronizarPagosMP(integracionId: string): Promise<{ creadas: number; vistos: number; detalles: string[]; error?: string }> {
  const admin = createAdminClient()
  const { data: integ } = await admin
    .from('integraciones_mp')
    .select('*')
    .eq('id', integracionId)
    .single()
  if (!integ || !integ.activa) return { creadas: 0, vistos: 0, detalles: [], error: 'Integración no activa' }

  // Pagos de las últimas 48h.
  // NOTA: NO incluimos range=date_created porque MP excluye silenciosamente los
  // pagos tipo pos_payment (Terminal Point/NFC) con ese filtro. Sin range, MP
  // devuelve todos los tipos: bank_transfer, pos_payment, credit_card, etc.
  const desde = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  try {
    const url = `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&begin_date=${desde}&end_date=NOW&limit=50`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${integ.access_token}` },
    })
    if (!res.ok) return { creadas: 0, vistos: 0, detalles: [], error: `MP search ${res.status}` }
    const data = await res.json()
    const pagos = (data.results ?? []) as MPPayment[]
    let creadas = 0
    const detalles: string[] = []
    for (const p of pagos) {
      const r = await procesarPagoMP(String(p.id), integracionId)
      if (r.creada) creadas++
      detalles.push(`${p.id}:${p.status}:${r.creada ? 'NEW' : r.error ?? 'skip'}`)
    }
    return { creadas, vistos: pagos.length, detalles }
  } catch (e) {
    return { creadas: 0, vistos: 0, detalles: [], error: e instanceof Error ? e.message : 'Error MP' }
  }
}
