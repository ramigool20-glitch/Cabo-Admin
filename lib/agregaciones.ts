type TxRow = {
  tipo: string
  monto: number
  moneda: string
  fecha: string
  categoria: string | null
  negocio_id: string | null
  monto_mxn_equivalente?: number | null
  tipo_cambio_usado?: number | null
}

export type Totales = {
  ingresos_mxn: number
  ingresos_usd: number
  gastos_mxn: number
  gastos_usd: number
  utilidad_mxn: number
  utilidad_usd: number
  // Totales agregados convertidos a MXN (USD se suman convertidos al rate del día de la tx)
  ingresos_total_mxn: number
  gastos_total_mxn: number
  utilidad_total_mxn: number
}

function equivMxn(r: TxRow, monto: number, fxFallback?: number | null): number {
  if (r.monto_mxn_equivalente != null) return Number(r.monto_mxn_equivalente)
  if (r.moneda === 'MXN') return monto
  // Si es USD sin equivalente persistido, convertimos al vuelo con el rate fallback
  if (r.moneda === 'USD' && fxFallback && fxFallback > 0) {
    return Number((monto * fxFallback).toFixed(2))
  }
  // Último recurso: 0 para no contaminar los totales
  return 0
}

export function totalizar(rows: TxRow[], fxFallback?: number | null): Totales {
  const t = rows.reduce(
    (acc, r) => {
      const monto = Number(r.monto) || 0
      const equiv = equivMxn(r, monto, fxFallback)
      const esUsd = r.moneda === 'USD'
      if (r.tipo === 'ingreso') {
        if (esUsd) acc.ingresos_usd += monto
        else acc.ingresos_mxn += monto
        acc.ingresos_total_mxn += equiv
      } else if (r.tipo === 'gasto' || r.tipo === 'multa_interna') {
        if (esUsd) acc.gastos_usd += monto
        else acc.gastos_mxn += monto
        acc.gastos_total_mxn += equiv
      }
      return acc
    },
    {
      ingresos_mxn: 0, ingresos_usd: 0,
      gastos_mxn: 0, gastos_usd: 0,
      ingresos_total_mxn: 0, gastos_total_mxn: 0,
    }
  )
  return {
    ...t,
    utilidad_mxn: t.ingresos_mxn - t.gastos_mxn,
    utilidad_usd: t.ingresos_usd - t.gastos_usd,
    utilidad_total_mxn: t.ingresos_total_mxn - t.gastos_total_mxn,
  }
}

export function porDia(rows: TxRow[], fxFallback?: number | null): Array<{ fecha: string; ingresos: number; gastos: number; utilidad: number }> {
  const m = new Map<string, { ingresos: number; gastos: number }>()
  for (const r of rows) {
    // Usamos equivalente MXN, así USD también entra a la gráfica
    const monto = Number(r.monto) || 0
    const equiv = equivMxn(r, monto, fxFallback)
    if (equiv === 0 && r.moneda === 'USD') continue
    const entry = m.get(r.fecha) ?? { ingresos: 0, gastos: 0 }
    if (r.tipo === 'ingreso') entry.ingresos += equiv
    else if (r.tipo === 'gasto' || r.tipo === 'multa_interna') entry.gastos += equiv
    m.set(r.fecha, entry)
  }
  return Array.from(m.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => ({
      fecha,
      ingresos: v.ingresos,
      gastos: v.gastos,
      utilidad: v.ingresos - v.gastos,
    }))
}

export function porNegocio(
  rows: TxRow[],
  negocios: Array<{ id: string; nombre: string }>,
  fxFallback?: number | null
): Array<{ nombre: string; ingresos: number; gastos: number }> {
  const m = new Map<string, { ingresos: number; gastos: number }>()
  for (const r of rows) {
    if (!r.negocio_id) continue
    const monto = Number(r.monto) || 0
    const equiv = equivMxn(r, monto, fxFallback)
    if (equiv === 0 && r.moneda === 'USD') continue
    const entry = m.get(r.negocio_id) ?? { ingresos: 0, gastos: 0 }
    if (r.tipo === 'ingreso') entry.ingresos += equiv
    else if (r.tipo === 'gasto' || r.tipo === 'multa_interna') entry.gastos += equiv
    m.set(r.negocio_id, entry)
  }
  return negocios
    .map((n) => ({
      nombre: n.nombre,
      ingresos: m.get(n.id)?.ingresos ?? 0,
      gastos: m.get(n.id)?.gastos ?? 0,
    }))
    .filter((x) => x.ingresos + x.gastos > 0)
    .sort((a, b) => b.ingresos + b.gastos - (a.ingresos + a.gastos))
}

export function porCategoria(rows: TxRow[], topN = 6, fxFallback?: number | null) {
  const m = new Map<string, number>()
  let total = 0
  for (const r of rows) {
    if (r.tipo !== 'gasto') continue
    const monto = Number(r.monto) || 0
    const equiv = equivMxn(r, monto, fxFallback)
    if (equiv === 0 && r.moneda === 'USD') continue
    const cat = (r.categoria ?? 'sin categoría').toLowerCase()
    m.set(cat, (m.get(cat) ?? 0) + equiv)
    total += equiv
  }
  return Array.from(m.entries())
    .map(([categoria, monto]) => ({
      categoria,
      monto,
      pct: total > 0 ? (monto / total) * 100 : 0,
    }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, topN)
}
