type Frecuencia = 'mensual' | 'quincenal' | 'semanal' | 'anual'

const FACTOR_MENSUAL: Record<Frecuencia, number> = {
  mensual: 1,
  quincenal: 2,     // 2 veces al mes
  semanal: 52 / 12, // ≈4.33 veces al mes
  anual: 1 / 12,
}

export function totalMensualEquivalente(
  recurrentes: Array<{ monto: number; moneda: string; frecuencia: string }>
): { mxn: number; usd: number } {
  let mxn = 0
  let usd = 0
  for (const r of recurrentes) {
    const factor = FACTOR_MENSUAL[r.frecuencia as Frecuencia] ?? 1
    const equivalente = Number(r.monto) * factor
    if (r.moneda === 'USD') usd += equivalente
    else mxn += equivalente
  }
  return { mxn, usd }
}
