/**
 * Mercado Pago — procesa cobros de Terminal Point (y otros) automáticamente.
 * Cuando MP notifica un pago, buscamos el detalle con el access_token de esa
 * cuenta y creamos una transacción de ingreso ligada.
 */
import { formatInTimeZone } from 'date-fns-tz'
import { TZ } from '@/lib/fechas'
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
  fee_details?: Array<{ amount: number; fee_payer?: string; type?: string }>
  transaction_details?: {
    net_received_amount?: number
    total_paid_amount?: number
    installment_amount?: number
  }
  /** ID del comercio que recibe (yo soy collector si == mp_user_id). */
  collector_id?: number | string
  /** Info del payer (yo soy payer si payer.id == mp_user_id → es gasto saliente). */
  payer?: { id?: number | string; email?: string | null }
  operation_type?: string
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
    .select('id, transaccion_id, estado')
    .eq('mp_payment_id', paymentId)
    .maybeSingle()
  if (yaProc?.transaccion_id) return { ok: true, creada: false }

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
  if (pago.status !== 'approved') return { ok: true, creada: false }

  const moneda = (pago.currency_id === 'USD' ? 'USD' : 'MXN') as 'MXN' | 'USD'
  const fecha = formatInTimeZone(new Date(pago.date_approved || pago.date_created), TZ, 'yyyy-MM-dd')

  // ── Detección de DIRECCIÓN del movimiento (ingreso vs gasto) ──────
  // Si soy collector → es ingreso (alguien me pagó)
  // Si soy payer → es gasto saliente (yo pagué a otro)
  const miUserId = String(integ.mp_user_id ?? '')
  const esIngreso = miUserId && String(pago.collector_id ?? '') === miUserId
  const esGasto = miUserId && !esIngreso && String(pago.payer?.id ?? '') === miUserId
  if (!esIngreso && !esGasto) return { ok: false, creada: false, error: 'El pago no corresponde al titular verificado de esta integración' }
  const tipoMov: 'ingreso' | 'gasto' = esGasto ? 'gasto' : 'ingreso'
  const fx = await aMxnEquivalente(pago.transaction_amount, moneda, fecha)

  const concepto = pago.description
    || `Cobro MP Point${pago.payment_method_id ? ` (${pago.payment_method_id})` : ''}`

  // Categorización híbrida: consulta histórico+IA para sugerir negocio/categoría
  // según el concepto del cobro. 3 niveles de confianza:
  //   alta   → aplica la sugerencia, push silencioso
  //   media  → aplica la sugerencia pero pide verificar, push normal
  //   baja   → deja en blanco, push con botones para responder en 1 tap
  const sug = await sugerirCategorizacion(admin, {
    concepto,
    tipo: tipoMov,
    monto: pago.transaction_amount,
  })

  const confianza = sug?.confianza ?? 'baja'

  const negocio_id =
    confianza === 'baja'
      ? null
      : sug?.negocio_id ?? integ.negocio_default_id
  const categoria =
    confianza === 'baja' ? null : sug?.categoria ?? null

  // Concepto: si es gasto saliente, prefijar para que sea obvio
  const conceptoFinal = tipoMov === 'gasto'
    ? `Gasto MP: ${concepto}`
    : concepto

  const totalFees = tipoMov === 'ingreso' ? (pago.fee_details ?? []).reduce((sum, f) => sum + Number(f.amount || 0), 0) : 0
  const netoRecibido = pago.transaction_details?.net_received_amount ?? (pago.transaction_amount - totalFees)
  const feeFx = totalFees > 0 ? await aMxnEquivalente(totalFees, moneda, fecha) : null
  const { data: result, error: txErr } = await admin.rpc('contabilizar_mp_atomico', { p: {
    payment_id: paymentId, integracion_id: integracionId, estado: pago.status,
    comision: totalFees, comision_mxn: feeFx?.monto_mxn_equivalente ?? 0,
    tx: { tipo: tipoMov, monto: pago.transaction_amount, moneda, fecha, negocio_id, categoria,
      monto_mxn_equivalente: fx.monto_mxn_equivalente, tipo_cambio_usado: fx.tipo_cambio_usado,
      concepto: conceptoFinal },
  } })
  if (txErr) return { ok: false, creada: false, error: txErr.message }
  if (!result?.creada) return { ok: true, creada: false }
  const tx = { id: result.id as string }

  // Sistema híbrido: pregunta / push según confianza. Best-effort, no rompe el flujo.
  // Loggea errores en webhook_log con fuente 'pregunta_push_mp' para diagnóstico.
  if (tx?.id) {
    const txResumen = {
      id: tx.id,
      monto: pago.transaction_amount,
      moneda,
      concepto,
      fecha,
      comision: totalFees > 0 ? Number(totalFees.toFixed(2)) : undefined,
      neto: totalFees > 0 ? Number(netoRecibido.toFixed(2)) : undefined,
    }
    const integResumen = {
      id: integracionId,
      nombre: integ.nombre,
      cuenta_id: integ.cuenta_id,
      negocio_default_id: integ.negocio_default_id,
    }

    // Política: SIEMPRE creamos pendiente para cobros MP, incluso si la IA tuvo
    // confianza alta. Razón: la IA puede confundirse con histórico genérico
    // (ej. "venta presencial" → match con "ventas" de Cabo Pharmacy online),
    // y queremos que el usuario verifique al menos hasta tener histórico real
    // de captura=api. La urgencia del push se ajusta según la confianza.
    const urgencia: 'alta' | 'media' | 'baja' =
      confianza === 'baja' ? 'alta' : confianza === 'media' ? 'media' : 'baja'

    const pendRes = await crearPendienteCategorizacion(admin, txResumen, sug, integResumen)
    const pushRes = await enviarPushCategorizacion(admin, txResumen, sug, integResumen, urgencia)

    // Loggea resultado de push/pendiente (no usa el helper logWebhook para evitar
    // import circular; insert directo)
    try {
      await admin.from('webhook_log').insert({
        fuente: 'webhook_mp',
        integracion_id: integracionId,
        ok: (pendRes?.ok ?? true) && pushRes.ok,
        payment_id: String(paymentId),
        resultado: {
          subtipo: 'push_pendiente',
          confianza,
          pendiente_creado: pendRes,
          push: pushRes,
        },
        error: [pendRes?.error, pushRes.error].filter(Boolean).join(' | ') || null,
      })
    } catch {
      // si webhook_log no existe aún, no rompemos
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
  //
  // FASE C: hacemos múltiples búsquedas para capturar también movimientos
  // salientes (money_transfer, withdraw, regular_payment desde payer).
  // El default solo trae donde tú eres collector. Los siguientes capturan
  // otros operation_types.
  const desde = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const baseUrl = `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&begin_date=${desde}&end_date=NOW&limit=50`

  const queries = [
    { label: 'default', url: baseUrl },
    { label: 'money_transfer', url: `${baseUrl}&operation_type=money_transfer` },
    { label: 'withdraw', url: `${baseUrl}&operation_type=withdraw` },
  ]

  try {
    let creadas = 0
    const detalles: string[] = []
    const idsVistos = new Set<string>() // dedup entre queries

    for (const q of queries) {
      const res = await fetch(q.url, {
        headers: { Authorization: `Bearer ${integ.access_token}` },
      })
      if (!res.ok) {
        detalles.push(`${q.label}:HTTP_${res.status}`)
        continue
      }
      const data = await res.json()
      const pagos = (data.results ?? []) as MPPayment[]
      for (const p of pagos) {
        const id = String(p.id)
        if (idsVistos.has(id)) continue
        idsVistos.add(id)
        const r = await procesarPagoMP(id, integracionId)
        if (r.creada) creadas++
        detalles.push(`${q.label}:${id}:${p.status}:${r.creada ? 'NEW' : r.error ?? 'skip'}`)
      }
    }

    return { creadas, vistos: idsVistos.size, detalles }
  } catch (e) {
    return { creadas: 0, vistos: 0, detalles: [], error: e instanceof Error ? e.message : 'Error MP' }
  }
}
