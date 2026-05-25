type TxRow = {
  tipo: string
  monto: number
  moneda: string
  fecha: string
  categoria: string | null
  negocio_id: string | null
}

export type Totales = {
  ingresos_mxn: number
  ingresos_usd: number
  gastos_mxn: number
  gastos_usd: number
  utilidad_mxn: number
  utilidad_usd: number
}

export function totalizar(rows: TxRow[]): Totales {
  const t = rows.reduce(
    (acc, r) => {
      const monto = Number(r.monto) || 0
      const esUsd = r.moneda === 'USD'
      if (r.tipo === 'ingreso') {
        if (esUsd) acc.ingresos_usd += monto
        else acc.ingresos_mxn += monto
      } else if (r.tipo === 'gasto' || r.tipo === 'multa_interna') {
        if (esUsd) acc.gastos_usd += monto
        else acc.gastos_mxn += monto
      }
      return acc
    },
    { ingresos_mxn: 0, ingresos_usd: 0, gastos_mxn: 0, gastos_usd: 0 } as Omit<Totales, 'utilidad_mxn' | 'utilidad_usd'>
  )
  return {
    ...t,
    utilidad_mxn: t.ingresos_mxn - t.gastos_mxn,
    utilidad_usd: t.ingresos_usd - t.gastos_usd,
  }
}

export function porDia(rows: TxRow[]): Array<{ fecha: string; ingresos: number; gastos: number; utilidad: number }> {
  const m = new Map<string, { ingresos: number; gastos: number }>()
  for (const r of rows) {
    if (r.moneda !== 'MXN') continue // gráfica única en MXN; los USD se ven aparte
    const entry = m.get(r.fecha) ?? { ingresos: 0, gastos: 0 }
    const monto = Number(r.monto) || 0
    if (r.tipo === 'ingreso') entry.ingresos += monto
    else if (r.tipo === 'gasto' || r.tipo === 'multa_interna') entry.gastos += monto
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
  negocios: Array<{ id: string; nombre: string }>
): Array<{ nombre: string; ingresos: number; gastos: number }> {
  const m = new Map<string, { ingresos: number; gastos: number }>()
  for (const r of rows) {
    if (!r.negocio_id || r.moneda !== 'MXN') continue
    const entry = m.get(r.negocio_id) ?? { ingresos: 0, gastos: 0 }
    const monto = Number(r.monto) || 0
    if (r.tipo === 'ingreso') entry.ingresos += monto
    else if (r.tipo === 'gasto' || r.tipo === 'multa_interna') entry.gastos += monto
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

export function porCategoria(rows: TxRow[], topN = 6) {
  const m = new Map<string, number>()
  let total = 0
  for (const r of rows) {
    if (r.tipo !== 'gasto') continue
    if (r.moneda !== 'MXN') continue
    const cat = (r.categoria ?? 'sin categoría').toLowerCase()
    const monto = Number(r.monto) || 0
    m.set(cat, (m.get(cat) ?? 0) + monto)
    total += monto
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
