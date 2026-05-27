export type MetricasPagina = {
  ventas: number              // en MXN (USD convertidos)
  ventas_usd: number          // original USD (informativo)
  ventas_mxn: number          // original MXN
  num_ventas: number
  gasto_ads: number           // en MXN (USD convertidos)
  costo_producto: number      // en MXN
  roas: number | null
  costo_por_venta: number | null
  margen_real: number
  margen_pct: number | null
}

/**
 * Calcula métricas de página digital convirtiendo USD a MXN al rate dado.
 * Si fxRate es null/0, asume 1 (no convierte). Pasar el rate del día por defecto.
 */
export function calcularMetricas(input: {
  ventas: Array<{ precio_venta: number; costo_producto: number | null; moneda: string }>
  gastos_ads: Array<{ monto: number; moneda: string }>
  fxRate?: number | null
}): MetricasPagina {
  const rate = input.fxRate && input.fxRate > 0 ? input.fxRate : 17 // fallback aproximado

  const toMxn = (monto: number | null, moneda: string): number => {
    const n = Number(monto) || 0
    return moneda === 'USD' ? n * rate : n
  }

  let ventas_mxn_total = 0
  let ventas_usd_total = 0
  let ventas_total_en_mxn = 0
  let costo_producto = 0

  for (const v of input.ventas) {
    const precio = Number(v.precio_venta) || 0
    if (v.moneda === 'USD') ventas_usd_total += precio
    else ventas_mxn_total += precio
    ventas_total_en_mxn += toMxn(precio, v.moneda)
    costo_producto += toMxn(v.costo_producto, v.moneda)
  }

  const gasto_ads = input.gastos_ads.reduce((s, g) => s + toMxn(g.monto, g.moneda), 0)
  const num_ventas = input.ventas.length

  const roas = gasto_ads > 0 ? ventas_total_en_mxn / gasto_ads : null
  const costo_por_venta = num_ventas > 0 ? gasto_ads / num_ventas : null
  const margen_real = ventas_total_en_mxn - costo_producto - gasto_ads
  const margen_pct = ventas_total_en_mxn > 0 ? margen_real / ventas_total_en_mxn : null

  return {
    ventas: ventas_total_en_mxn,
    ventas_usd: ventas_usd_total,
    ventas_mxn: ventas_mxn_total,
    num_ventas,
    gasto_ads,
    costo_producto,
    roas,
    costo_por_venta,
    margen_real,
    margen_pct,
  }
}
