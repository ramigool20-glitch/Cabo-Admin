export type MetricasPagina = {
  ventas: number
  num_ventas: number
  gasto_ads: number
  costo_producto: number
  roas: number | null            // ventas / gasto_ads
  costo_por_venta: number | null // gasto_ads / num_ventas
  margen_real: number            // ventas - costo_producto - gasto_ads
  margen_pct: number | null      // margen_real / ventas
}

export function calcularMetricas(input: {
  ventas: Array<{ precio_venta: number; costo_producto: number | null; moneda: string }>
  gastos_ads: Array<{ monto: number; moneda: string }>
}): MetricasPagina {
  const ventas_total = input.ventas.reduce((s, v) => s + (Number(v.precio_venta) || 0), 0)
  const costo_producto = input.ventas.reduce((s, v) => s + (Number(v.costo_producto) || 0), 0)
  const gasto_ads = input.gastos_ads.reduce((s, g) => s + (Number(g.monto) || 0), 0)
  const num_ventas = input.ventas.length

  const roas = gasto_ads > 0 ? ventas_total / gasto_ads : null
  const costo_por_venta = num_ventas > 0 ? gasto_ads / num_ventas : null
  const margen_real = ventas_total - costo_producto - gasto_ads
  const margen_pct = ventas_total > 0 ? margen_real / ventas_total : null

  return {
    ventas: ventas_total,
    num_ventas,
    gasto_ads,
    costo_producto,
    roas,
    costo_por_venta,
    margen_real,
    margen_pct,
  }
}
