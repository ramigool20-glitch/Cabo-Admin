/**
 * Obtiene el tipo de cambio USD/MXN del día.
 *
 * Estrategia:
 * 1. Intenta open.er-api.com (gratis, sin token, alta disponibilidad)
 * 2. Fallback exchangerate.host (gratis)
 * 3. Fallback exchangerate-api.com v4 (gratis)
 *
 * Devuelve el "mid rate" (mid-market, lo que sale en Google).
 * Para "rate de compra" en Cabos, restamos ~0.5 al mid (spread casa de cambio).
 */

export type FxFetched = {
  mid_rate: number
  rate_compra: number
  rate_venta: number
  source: string
  fetched_at: string
}

const SPREAD_COMPRA = 0.5 // peso menos que mid (rate al que casa de cambio te compra USD)
const SPREAD_VENTA  = 0.5 // peso más que mid (rate al que te vende USD)

async function tryOpenErApi(): Promise<{ rate: number; source: string } | null> {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD', {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const data = await r.json() as { rates?: { MXN?: number }; result?: string }
    if (data.result !== 'success' || !data.rates?.MXN) return null
    return { rate: data.rates.MXN, source: 'open.er-api' }
  } catch {
    return null
  }
}

async function tryExchangerateHost(): Promise<{ rate: number; source: string } | null> {
  try {
    const r = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=MXN', {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const data = await r.json() as { rates?: { MXN?: number }; success?: boolean }
    if (!data.rates?.MXN) return null
    return { rate: data.rates.MXN, source: 'exchangerate.host' }
  } catch {
    return null
  }
}

async function tryExchangerateApi(): Promise<{ rate: number; source: string } | null> {
  try {
    const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) return null
    const data = await r.json() as { rates?: { MXN?: number } }
    if (!data.rates?.MXN) return null
    return { rate: data.rates.MXN, source: 'exchangerate-api' }
  } catch {
    return null
  }
}

export async function fetchUsdMxn(): Promise<FxFetched | null> {
  // Cascading fallback
  const result =
    (await tryOpenErApi()) ||
    (await tryExchangerateHost()) ||
    (await tryExchangerateApi())

  if (!result) return null

  const mid = Number(result.rate.toFixed(4))
  return {
    mid_rate: mid,
    rate_compra: Number((mid - SPREAD_COMPRA).toFixed(4)),
    rate_venta: Number((mid + SPREAD_VENTA).toFixed(4)),
    source: result.source,
    fetched_at: new Date().toISOString(),
  }
}
