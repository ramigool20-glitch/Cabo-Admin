'use server'

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { flashOk } from '@/lib/flash'
import { aMxnEquivalente } from '@/lib/fx/server'
import { registrarHistorial } from '@/lib/historial'
import { sincronizarTxASubTabla } from '@/lib/sync-ads-ventas'
import { vigilarMovimiento } from '@/lib/ai/observaciones'
import { refrescarSaldoIntegracion } from '@/lib/integraciones/mercadopago'

/**
 * Si la cuenta_id tiene una integración MP activa, dispara un refresh del
 * saldo MP en background. Esto mantiene el "watchdog" del cashflow (saldo
 * real vs calculado) actualizado tras cualquier movimiento manual en
 * cuentas integradas. Best-effort, nunca bloquea ni rompe.
 */
async function refrescarSaldoMpSiAplica(cuentaId: string | null | undefined): Promise<void> {
  if (!cuentaId) return
  try {
    const admin = createAdminClient()
    const { data: integ } = await admin
      .from('integraciones_mp')
      .select('id')
      .eq('cuenta_id', cuentaId)
      .eq('activa', true)
      .maybeSingle()
    if (integ?.id) {
      // Fire-and-forget: no awaiteamos para no demorar la respuesta
      refrescarSaldoIntegracion(integ.id).catch(() => {})
    }
  } catch {
    // tabla no existe o algo, no rompemos el flujo principal
  }
}

// Sube una foto al bucket privado 'recibos'. Devuelve el storage path (no signed URL).
async function subirFoto(file: File | null, userId: string): Promise<{ path?: string; error?: string }> {
  if (!file || file.size === 0) return {}
  if (file.size > 10 * 1024 * 1024) return { error: 'La foto pesa más de 10 MB' }
  if (!file.type.startsWith('image/')) return { error: 'Solo imágenes' }
  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const path = `tx/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const buf = Buffer.from(await file.arrayBuffer())
  const admin = createAdminClient()
  const { error } = await admin.storage.from('recibos').upload(path, buf, {
    contentType: file.type,
    upsert: false,
  })
  if (error) return { error: 'Subida de foto: ' + error.message }
  return { path }
}

const MetodoPagoEnum = z.enum([
  'stripe', 'mp_terminal', 'mp_transferencia', 'mp_link',
  'efectivo_mxn', 'efectivo_usd', 'transferencia_bancaria',
  'tarjeta', 'domiciliado', 'otro',
])
const SplitSchema = z.object({
  cuenta_id_2: z.string().uuid('Selecciona la cuenta 2'),
  metodo_pago_2: MetodoPagoEnum.optional().nullable(),
  monto_1: z.coerce.number().positive('El monto de la cuenta 1 debe ser mayor a 0'),
})

const TransaccionSchema = z.object({
  tipo: z.enum(['ingreso', 'gasto']),
  monto: z.coerce.number().positive('El monto debe ser mayor a 0'),
  moneda: z.enum(['MXN', 'USD']),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  negocio_id: z.string().uuid('Selecciona un negocio'),
  cuenta_id: z.string().uuid('Selecciona una cuenta'),
  metodo_pago: z.enum([
    'stripe', 'mp_terminal', 'mp_transferencia', 'mp_link',
    'efectivo_mxn', 'efectivo_usd', 'transferencia_bancaria',
    'tarjeta', 'domiciliado', 'otro',
  ]).optional().nullable(),
  categoria: z.string().max(60).optional().nullable(),
  concepto: z.string().max(200).optional().nullable(),
  notas: z.string().max(500).optional().nullable(),
  atribuido_a: z.string().uuid().optional().nullable(),
})

export type ActionState = {
  ok?: boolean
  error?: string
  fieldErrors?: Record<string, string[]>
}

function parseFormData(formData: FormData) {
  const raw = {
    tipo: formData.get('tipo'),
    monto: formData.get('monto'),
    moneda: formData.get('moneda'),
    fecha: formData.get('fecha'),
    negocio_id: formData.get('negocio_id'),
    cuenta_id: formData.get('cuenta_id'),
    metodo_pago: formData.get('metodo_pago') || null,
    categoria: formData.get('categoria') || null,
    concepto: formData.get('concepto') || null,
    notas: formData.get('notas') || null,
    atribuido_a: formData.get('atribuido_a') || null,
  }
  return TransaccionSchema.safeParse(raw)
}

export async function createTransaccion(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parseFormData(formData)
  if (!parsed.success) {
    return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // Foto de evidencia (opcional)
  const fotoFile = formData.get('foto') as File | null
  const fotoUp = await subirFoto(fotoFile, user.id)
  if (fotoUp.error) return { error: fotoUp.error }
  const fotoPath = fotoUp.path ?? null

  // ¿Pago dividido en 2 cuentas?
  const splitActivo = formData.get('split_activo') === '1'
  let splitData: z.infer<typeof SplitSchema> | null = null
  if (splitActivo) {
    const sp = SplitSchema.safeParse({
      cuenta_id_2: formData.get('cuenta_id_2'),
      metodo_pago_2: formData.get('metodo_pago_2') || null,
      monto_1: formData.get('monto_1'),
    })
    if (!sp.success) {
      return { error: 'Split inválido', fieldErrors: sp.error.flatten().fieldErrors }
    }
    if (sp.data.cuenta_id_2 === parsed.data.cuenta_id) {
      return { error: 'Las dos cuentas del split deben ser distintas' }
    }
    if (sp.data.monto_1 >= parsed.data.monto) {
      return { error: 'El monto de la cuenta 1 debe ser menor al total' }
    }
    splitData = sp.data
  }

  // Calcular equivalente en MXN según el tipo de cambio del día de la transacción
  const fx = await aMxnEquivalente(parsed.data.monto, parsed.data.moneda, parsed.data.fecha)

  if (!splitData) {
    // ── Flujo normal: una sola transacción ───────────────────────────
    const insertData = {
      ...parsed.data,
      monto_mxn_equivalente: fx.monto_mxn_equivalente,
      tipo_cambio_usado: fx.tipo_cambio_usado,
      metodo_captura: 'manual' as const,
      foto_url: fotoPath,
      capturado_por: user.id,
    }

    const { data: nuevaTx, error } = await supabase
      .from('transacciones')
      .insert(insertData)
      .select('id')
      .single()

    if (error) return { error: error.message }

    // Registrar en historial
    if (nuevaTx?.id) {
      await registrarHistorial(nuevaTx.id, 'creada', user.id, null, insertData)
      await sincronizarTxASubTabla(supabase, {
        txId: nuevaTx.id,
        tipo: parsed.data.tipo,
        negocio_id: parsed.data.negocio_id,
        monto: parsed.data.monto,
        moneda: parsed.data.moneda,
        fecha: parsed.data.fecha,
        categoria: parsed.data.categoria ?? null,
        concepto: parsed.data.concepto ?? null,
        user_id: user.id,
        fx,
      })
      await vigilarMovimiento({
        id: nuevaTx.id,
        tipo: parsed.data.tipo,
        monto: parsed.data.monto,
        moneda: parsed.data.moneda,
        fecha: parsed.data.fecha,
        concepto: parsed.data.concepto ?? null,
        categoria: parsed.data.categoria ?? null,
        cuenta_id: parsed.data.cuenta_id ?? null,
      })
    }
  } else {
    // ── Flujo split: dos transacciones con split_grupo_id en común ───
    const grupoId = randomUUID()
    const monto1 = splitData.monto_1
    const monto2 = Number((parsed.data.monto - monto1).toFixed(2))
    const rate = fx.tipo_cambio_usado
    const mxn1 = Number((parsed.data.moneda === 'USD' ? monto1 * rate : monto1).toFixed(2))
    const mxn2 = Number((parsed.data.moneda === 'USD' ? monto2 * rate : monto2).toFixed(2))

    const conceptoBase = parsed.data.concepto ?? null
    const conceptoSufijo = conceptoBase ? `${conceptoBase} · split` : 'Pago dividido'

    const filaComun = {
      tipo: parsed.data.tipo,
      moneda: parsed.data.moneda,
      fecha: parsed.data.fecha,
      negocio_id: parsed.data.negocio_id,
      categoria: parsed.data.categoria ?? null,
      notas: parsed.data.notas ?? null,
      atribuido_a: parsed.data.atribuido_a ?? null,
      tipo_cambio_usado: rate,
      metodo_captura: 'manual' as const,
      foto_url: fotoPath,
      capturado_por: user.id,
      split_grupo_id: grupoId,
    }

    const filas = [
      {
        ...filaComun,
        monto: monto1,
        monto_mxn_equivalente: mxn1,
        cuenta_id: parsed.data.cuenta_id,
        metodo_pago: parsed.data.metodo_pago ?? null,
        concepto: `${conceptoSufijo} 1/2`,
      },
      {
        ...filaComun,
        monto: monto2,
        monto_mxn_equivalente: mxn2,
        cuenta_id: splitData.cuenta_id_2,
        metodo_pago: splitData.metodo_pago_2 ?? null,
        concepto: `${conceptoSufijo} 2/2`,
      },
    ]

    const { data: nuevas, error } = await supabase
      .from('transacciones')
      .insert(filas)
      .select('id, monto, cuenta_id, metodo_pago')

    if (error) {
      // Si la columna split_grupo_id no existe aún en la DB
      if (/split_grupo_id/.test(error.message)) {
        return { error: 'Falta aplicar la migración 0034_split_pago.sql en Supabase' }
      }
      return { error: error.message }
    }

    for (const tx of nuevas ?? []) {
      await registrarHistorial(tx.id, 'creada', user.id, null, { ...tx, split_grupo_id: grupoId })
      await sincronizarTxASubTabla(supabase, {
        txId: tx.id,
        tipo: parsed.data.tipo,
        negocio_id: parsed.data.negocio_id,
        monto: Number(tx.monto),
        moneda: parsed.data.moneda,
        fecha: parsed.data.fecha,
        categoria: parsed.data.categoria ?? null,
        concepto: conceptoBase,
        user_id: user.id,
        fx: { ...fx, monto_mxn_equivalente: parsed.data.moneda === 'USD' ? Number(tx.monto) * rate : Number(tx.monto) },
      })
    }

    // Auditor: vigilamos el TOTAL una sola vez (no cada split) para no spamear duplicados
    if (nuevas?.[0]?.id) {
      await vigilarMovimiento({
        id: nuevas[0].id,
        tipo: parsed.data.tipo,
        monto: parsed.data.monto,
        moneda: parsed.data.moneda,
        fecha: parsed.data.fecha,
        concepto: conceptoBase,
        categoria: parsed.data.categoria ?? null,
        cuenta_id: parsed.data.cuenta_id ?? null,
      })
    }
  }

  // Watchdog: refresca saldo MP de la(s) cuenta(s) afectadas en background
  await refrescarSaldoMpSiAplica(parsed.data.cuenta_id)
  if (splitData) await refrescarSaldoMpSiAplica(splitData.cuenta_id_2)

  revalidatePath('/transacciones')
  revalidatePath('/dashboard')
  revalidatePath('/cashflow')
  revalidatePath('/negocios')
  revalidatePath(`/negocios/${parsed.data.negocio_id}`)
  revalidatePath(`/negocios/${parsed.data.negocio_id}/ads`)
  revalidatePath(`/negocios/${parsed.data.negocio_id}/ventas`)
  revalidatePath('/casa')
  flashOk('/transacciones', splitActivo ? 'tx_split_creada' : 'tx_creada')
}

export async function updateTransaccion(
  id: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = parseFormData(formData)
  if (!parsed.success) {
    return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // Foto nueva opcional (al editar). Si manda `foto_quitar=1`, se borra la actual.
  const fotoFile = formData.get('foto') as File | null
  const fotoUp = await subirFoto(fotoFile, user.id)
  if (fotoUp.error) return { error: fotoUp.error }
  const quitarFoto = formData.get('foto_quitar') === '1'

  // Estado actual (para diff y para conocer foto previa)
  const { data: antes } = await supabase
    .from('transacciones')
    .select('tipo, monto, moneda, fecha, concepto, categoria, metodo_pago, notas, negocio_id, cuenta_id, atribuido_a, monto_mxn_equivalente, tipo_cambio_usado, foto_url')
    .eq('id', id)
    .maybeSingle()

  // Recalcular equivalente MXN porque pudo haber cambiado monto/moneda/fecha
  const fx = await aMxnEquivalente(parsed.data.monto, parsed.data.moneda, parsed.data.fecha)

  // foto_url final: nueva > quitar > mantener
  const fotoUrlNueva = fotoUp.path ?? null
  const fotoFinal = fotoUrlNueva ?? (quitarFoto ? null : antes?.foto_url ?? null)

  const updateData: Record<string, unknown> = {
    ...parsed.data,
    monto_mxn_equivalente: fx.monto_mxn_equivalente,
    tipo_cambio_usado: fx.tipo_cambio_usado,
    foto_url: fotoFinal,
  }

  // Si se quitó/reemplazó, intentamos borrar el archivo viejo del bucket (best-effort)
  const fotoVieja = antes?.foto_url
  if (fotoVieja && fotoVieja !== fotoFinal) {
    const admin = createAdminClient()
    admin.storage.from('recibos').remove([fotoVieja]).catch(() => {})
  }

  const { error } = await supabase.from('transacciones').update(updateData).eq('id', id)

  if (error) return { error: error.message }

  // Registrar en historial
  await registrarHistorial(id, 'editada', user.id, antes ?? null, updateData)

  // Watchdog: refrescar saldo MP en BG si cualquiera de las dos cuentas
  // (antes o después de la edición) tiene integración.
  await refrescarSaldoMpSiAplica(parsed.data.cuenta_id)
  if (antes?.cuenta_id && antes.cuenta_id !== parsed.data.cuenta_id) {
    await refrescarSaldoMpSiAplica(antes.cuenta_id as string)
  }

  revalidatePath('/transacciones')
  revalidatePath(`/transacciones/${id}`)
  revalidatePath('/dashboard')
  revalidatePath('/cashflow')
  revalidatePath('/negocios')
  if (parsed.data.negocio_id) {
    revalidatePath(`/negocios/${parsed.data.negocio_id}`)
    revalidatePath(`/negocios/${parsed.data.negocio_id}/ads`)
    revalidatePath(`/negocios/${parsed.data.negocio_id}/ventas`)
  }
  revalidatePath('/casa')
  flashOk('/transacciones', 'tx_actualizada')
}

export async function deleteTransaccion(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // Snapshot antes de borrar (para historial)
  const { data: antes } = await supabase
    .from('transacciones')
    .select('tipo, monto, moneda, fecha, concepto, categoria, metodo_pago, notas, negocio_id, cuenta_id, atribuido_a, monto_mxn_equivalente, tipo_cambio_usado')
    .eq('id', id)
    .maybeSingle()

  // Limpiar todas las FKs antes de borrar la transacción
  await Promise.all([
    // Si vino de un pago recurrente, borrar el registro de recurrentes_pagados
    supabase.from('recurrentes_pagados').delete().eq('transaccion_id', id),
    // Desligar otras tablas que pueden referenciarla (no las borramos, solo unlinkeamos)
    supabase.from('cobros_stripe').update({ transaccion_id: null }).eq('transaccion_id', id),
    supabase.from('eventos_pagos').update({ transaccion_id: null }).eq('transaccion_id', id),
    supabase.from('multas').update({ transaccion_id: null }).eq('transaccion_id', id),
  ])

  // Registrar en historial ANTES del delete (porque después la FK se rompe)
  if (antes) {
    await registrarHistorial(id, 'eliminada', user.id, antes, null)
  }

  const { error } = await supabase.from('transacciones').delete().eq('id', id)
  if (error) return { error: error.message }

  // Watchdog: refrescar saldo MP de la cuenta borrada en BG
  await refrescarSaldoMpSiAplica(antes?.cuenta_id as string | null | undefined)

  revalidatePath('/transacciones')
  revalidatePath('/dashboard')
  revalidatePath('/cashflow')
  revalidatePath('/negocios')
  if (antes?.negocio_id) {
    revalidatePath(`/negocios/${antes.negocio_id}`)
    revalidatePath(`/negocios/${antes.negocio_id}/ads`)
    revalidatePath(`/negocios/${antes.negocio_id}/ventas`)
  }
  revalidatePath('/casa')
  flashOk('/transacciones', 'tx_eliminada')
}
