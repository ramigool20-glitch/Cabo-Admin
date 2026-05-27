import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'
import { fetchUsdMxn } from './fetch'

export type FxRate = {
  fecha: string
  rate_compra: number
  rate_venta: number | null
  mid_rate: number | null
  source: string | null
  manual: boolean
  fetched_at: string
}

/**
 * Devuelve el rate del día (HOY en zona Mazatlán).
 * Si no existe en la DB, lo intenta traer de la API pública.
 * Si la API falla, devuelve el último rate conocido.
 */
export async function getRateHoy(): Promise<FxRate | null> {
  const admin = createAdminClient()
  const hoy = hoyEnCabos()

  // 1) ¿Ya está en la DB?
  const { data: existing } = await admin
    .from('fx_rates')
    .select('*')
    .eq('fecha', hoy)
    .single()

  if (existing) return existing as FxRate

  // 2) Traer de API y guardar
  const fetched = await fetchUsdMxn()
  if (fetched) {
    const { data: inserted, error } = await admin
      .from('fx_rates')
      .upsert({
        fecha: hoy,
        rate_compra: fetched.rate_compra,
        rate_venta: fetched.rate_venta,
        mid_rate: fetched.mid_rate,
        source: fetched.source,
        manual: false,
        fetched_at: fetched.fetched_at,
      }, { onConflict: 'fecha' })
      .select('*')
      .single()

    if (!error && inserted) return inserted as FxRate
  }

  // 3) Último rate conocido como fallback
  const { data: ultimo } = await admin
    .from('fx_rates')
    .select('*')
    .order('fecha', { ascending: false })
    .limit(1)
    .single()

  return (ultimo as FxRate) ?? null
}

/**
 * Aplica el rate del día a un monto USD para obtener el equivalente MXN.
 * Si moneda es MXN, devuelve el mismo monto.
 */
export async function aMxnEquivalente(
  monto: number,
  moneda: 'MXN' | 'USD',
  fecha?: string
): Promise<{ monto_mxn_equivalente: number; tipo_cambio_usado: number }> {
  if (moneda === 'MXN') {
    return { monto_mxn_equivalente: monto, tipo_cambio_usado: 1 }
  }

  const admin = createAdminClient()
  const targetFecha = fecha ?? hoyEnCabos()

  // Buscar rate de la fecha exacta
  const { data: rate } = await admin
    .from('fx_rates')
    .select('rate_compra')
    .eq('fecha', targetFecha)
    .single()

  if (rate) {
    const r = Number(rate.rate_compra)
    return {
      monto_mxn_equivalente: Number((monto * r).toFixed(2)),
      tipo_cambio_usado: r,
    }
  }

  // Si no hay rate exacto, usar el más reciente anterior
  const { data: anterior } = await admin
    .from('fx_rates')
    .select('rate_compra')
    .lte('fecha', targetFecha)
    .order('fecha', { ascending: false })
    .limit(1)
    .single()

  if (anterior) {
    const r = Number(anterior.rate_compra)
    return {
      monto_mxn_equivalente: Number((monto * r).toFixed(2)),
      tipo_cambio_usado: r,
    }
  }

  // Sin nada en DB, intentar fetch
  const fetched = await fetchUsdMxn()
  if (fetched) {
    return {
      monto_mxn_equivalente: Number((monto * fetched.rate_compra).toFixed(2)),
      tipo_cambio_usado: fetched.rate_compra,
    }
  }

  // Último recurso: rate aproximado
  return { monto_mxn_equivalente: monto * 17, tipo_cambio_usado: 17 }
}
