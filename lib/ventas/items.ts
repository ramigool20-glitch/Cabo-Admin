/**
 * Lógica compartida para venta_items: cálculos de subtotal, ganancia, totales.
 *
 * Se usa tanto en el cliente (UI form) como en el servidor (action que
 * inserta a BD), para que ambos calculen exactamente igual.
 */

export type VentaItemInput = {
  producto_id: string | null
  nombre_snapshot: string
  codigo_barras_snapshot?: string | null
  categoria_snapshot?: string | null
  costo_unitario_snapshot_mxn: number | null
  cantidad: number
  precio_unitario_mxn: number
  descuento_pct: number
}

export type VentaItemCalculado = VentaItemInput & {
  descuento_mxn: number
  subtotal_mxn: number
  ganancia_mxn: number | null
  margen_pct: number | null
}

export function calcularItem(input: VentaItemInput): VentaItemCalculado {
  const cantidad = Math.max(0, input.cantidad)
  const precio = Math.max(0, input.precio_unitario_mxn)
  const descPct = Math.max(0, Math.min(100, input.descuento_pct))
  const bruto = cantidad * precio
  const descuento_mxn = bruto * (descPct / 100)
  const subtotal_mxn = bruto - descuento_mxn

  let ganancia_mxn: number | null = null
  let margen_pct: number | null = null
  if (input.costo_unitario_snapshot_mxn != null && input.costo_unitario_snapshot_mxn >= 0) {
    const costoTotal = input.costo_unitario_snapshot_mxn * cantidad
    ganancia_mxn = subtotal_mxn - costoTotal
    margen_pct = subtotal_mxn > 0 ? (ganancia_mxn / subtotal_mxn) * 100 : 0
  }

  return { ...input, descuento_mxn, subtotal_mxn, ganancia_mxn, margen_pct }
}

export function calcularTotalesVenta(items: VentaItemCalculado[]) {
  let bruto = 0
  let descuento = 0
  let subtotal = 0
  let costoTotal = 0
  let ganancia = 0
  let conCosto = 0
  for (const i of items) {
    bruto += i.cantidad * i.precio_unitario_mxn
    descuento += i.descuento_mxn
    subtotal += i.subtotal_mxn
    if (i.ganancia_mxn != null && i.costo_unitario_snapshot_mxn != null) {
      ganancia += i.ganancia_mxn
      costoTotal += i.costo_unitario_snapshot_mxn * i.cantidad
      conCosto++
    }
  }
  const margenPct = subtotal > 0 && conCosto > 0 ? (ganancia / subtotal) * 100 : null
  return {
    bruto, descuento, subtotal,
    costo_total: costoTotal,
    ganancia,
    margen_pct: margenPct,
    items_count: items.length,
    items_con_costo: conCosto,
  }
}
