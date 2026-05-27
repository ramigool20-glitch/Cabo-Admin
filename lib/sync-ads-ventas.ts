/**
 * Sincronización bidireccional entre transacciones ↔ gastos_ads / ventas
 *
 * Una transacción con categoría tipo "ads-*" o concepto que mencione
 * Meta/Google/TikTok ADS en una página digital se replica como gastos_ads
 * (para que aparezca en ROAS, métricas, etc).
 *
 * Igual para ventas: categoría "ventas" en página digital → fila en ventas.
 *
 * Marca el vínculo en `notas` con el id, para no duplicar.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

type FxResult = { monto_mxn_equivalente: number; tipo_cambio_usado: number }

export type SyncTxInput = {
  txId: string
  tipo: 'ingreso' | 'gasto'
  negocio_id: string
  monto: number
  moneda: 'MXN' | 'USD'
  fecha: string
  categoria: string | null
  concepto: string | null
  user_id: string
  fx: FxResult
}

function detectarPlataformaAds(categoria: string | null, concepto: string | null): string | null {
  const t = `${categoria ?? ''} ${concepto ?? ''}`.toLowerCase()
  if (!t.trim()) return null
  // ¿Es algo relacionado con ads?
  const esAds = /\bads?\b|anuncio|publicidad|campa[ñn]a|advert/.test(t)
  if (!esAds) {
    // O si la categoría empieza con "ads-"
    const cat = (categoria ?? '').toLowerCase()
    if (!cat.startsWith('ads')) return null
  }
  if (/meta|facebook|fb|instagram|ig/.test(t)) return 'meta'
  if (/google|adwords|youtube/.test(t)) return 'google'
  if (/tiktok|tik\s?tok/.test(t)) return 'tiktok'
  return 'otro'  // ads pero plataforma no detectada
}

function esVenta(categoria: string | null, concepto: string | null): boolean {
  const c = (categoria ?? '').toLowerCase()
  if (c === 'ventas' || c === 'venta') return true
  const con = (concepto ?? '').toLowerCase()
  // Solo si concepto es muy explícito de venta — evita falsos positivos
  return /^venta:|^vendido:/i.test(con)
}

/**
 * Replica una transacción a gastos_ads o ventas si aplica.
 * No falla si las tablas no existen o si el negocio no es página digital.
 */
export async function sincronizarTxASubTabla(
  supabase: SupabaseClient,
  input: SyncTxInput
): Promise<void> {
  try {
    // Buscar tipo de negocio
    const { data: neg } = await supabase
      .from('negocios')
      .select('tipo')
      .eq('id', input.negocio_id)
      .single()
    if (neg?.tipo !== 'pagina_digital') return  // solo aplica a páginas digitales

    // Ya está sincronizado en gastos_ads o ventas (busca por nota inversa)?
    // En este flujo siempre creamos hacia abajo, así que solo verificamos
    // si la TX original ya tiene su contrapartida marcada en notas (rotación)
    const marker = `Sincronizado desde transacciones (id: ${input.txId})`

    if (input.tipo === 'gasto') {
      const plataforma = detectarPlataformaAds(input.categoria, input.concepto)
      if (!plataforma) return

      // Idempotente: revisa si ya existe gastos_ads ligado a esta tx
      const { data: exists } = await supabase
        .from('gastos_ads')
        .select('id')
        .eq('negocio_id', input.negocio_id)
        .eq('fecha', input.fecha)
        .eq('monto', input.monto)
        .limit(1)
        .maybeSingle()
      if (exists) return  // ya hay uno equivalente, no dupliques

      await supabase.from('gastos_ads').insert({
        negocio_id: input.negocio_id,
        fecha: input.fecha,
        monto: input.monto,
        moneda: input.moneda,
        monto_mxn: input.fx.monto_mxn_equivalente,
        tipo_cambio_usado: input.fx.tipo_cambio_usado,
        plataforma,
        metodo_captura: 'manual',
        capturado_por: input.user_id,
      })
      // Marca la transacción para sabemos que ya tiene su contrapartida
      await supabase
        .from('transacciones')
        .update({ notas: marker })
        .eq('id', input.txId)
        .is('notas', null)
    } else if (input.tipo === 'ingreso' && esVenta(input.categoria, input.concepto)) {
      // Idempotente check
      const { data: exists } = await supabase
        .from('ventas')
        .select('id')
        .eq('negocio_id', input.negocio_id)
        .eq('fecha', input.fecha)
        .eq('precio_venta', input.monto)
        .limit(1)
        .maybeSingle()
      if (exists) return

      await supabase.from('ventas').insert({
        negocio_id: input.negocio_id,
        fecha: input.fecha,
        producto: input.concepto || 'Venta',
        precio_venta: input.monto,
        moneda: input.moneda,
        precio_venta_mxn: input.fx.monto_mxn_equivalente,
        tipo_cambio_usado: input.fx.tipo_cambio_usado,
        capturado_por: input.user_id,
      })
      await supabase
        .from('transacciones')
        .update({ notas: marker })
        .eq('id', input.txId)
        .is('notas', null)
    }
  } catch {
    // Silencioso: si falla, la transacción ya está guardada
  }
}
