/**
 * Cálculo de saldos por cuenta basado en:
 *   saldo_inicial + Σ(ingresos) - Σ(gastos)
 *
 * Fuente de verdad única — usada por /cashflow, /dashboard y donde
 * se muestre saldo de una cuenta.
 */

export type CuentaConSaldoInicial = {
  id: string
  nombre: string
  titular: string | null
  tipo: string
  moneda: 'MXN' | 'USD'
  saldo_inicial_mxn: number | string | null
  saldo_inicial_usd: number | string | null
  saldo_inicial_fecha: string | null
  saldo_inicial_locked: boolean | null
  saldo_inicial_notas: string | null
}

export type TxParaSaldo = {
  tipo: string
  monto: number | string
  moneda: string
  cuenta_id: string | null
  fecha: string  // YYYY-MM-DD — necesario para filtrar tx posteriores al saldo inicial
}

export type SaldosCuenta = {
  cuenta_id: string
  nombre: string
  titular: string | null
  tipo: string
  moneda: 'MXN' | 'USD'
  ingresos_mxn: number
  ingresos_usd: number
  gastos_mxn: number
  gastos_usd: number
  saldo_inicial_mxn: number
  saldo_inicial_usd: number
  saldo_mxn: number          // saldo actual MXN
  saldo_usd: number          // saldo actual USD
  saldo_total_mxn: number    // suma equivalente en MXN (usa fxRate)
  locked: boolean
  fecha_inicial: string | null
  notas_inicial: string | null
}

export type SaldosResumen = {
  total_mxn: number          // suma total en MXN (incluye USD convertido)
  total_solo_mxn: number     // solo cuentas/saldos MXN
  total_solo_usd: number     // solo USD original
  por_cuenta: SaldosCuenta[]
}

/**
 * Calcula saldos por cuenta y total agregado.
 *
 * Reglas:
 * - El saldo_inicial representa el saldo AL INICIO del día `saldo_inicial_fecha`
 * - Cuentan tx con fecha >= saldo_inicial_fecha (incluyendo el mismo día)
 * - Las tx ANTES del día inicial se ignoran (ya están reflejadas en el saldo)
 * - Cuentas SIN saldo inicial capturado NO suman al total (saldo = 0)
 */
/**
 * Fecha de saldo inicial más antigua entre las cuentas con saldo bloqueado.
 * Sirve para acotar el query de transacciones (las tx anteriores se ignoran
 * en el cálculo), evitando el corte silencioso de 1000 filas de Supabase.
 */
export function fechaSaldoMasAntigua(
  cuentas: Pick<CuentaConSaldoInicial, 'saldo_inicial_fecha' | 'saldo_inicial_locked'>[]
): string {
  let min: string | null = null
  for (const c of cuentas) {
    if (!c.saldo_inicial_locked || !c.saldo_inicial_fecha) continue
    if (!min || c.saldo_inicial_fecha < min) min = c.saldo_inicial_fecha
  }
  return min ?? '2000-01-01'
}

export function calcularSaldos(
  cuentas: CuentaConSaldoInicial[],
  txs: TxParaSaldo[],
  fxRate: number | null
): SaldosResumen {
  const fx = fxRate ?? 17

  // Mapa de fecha de inicial por cuenta — para filtrar tx posteriores
  const fechaInicialPorCuenta = new Map<string, string | null>()
  for (const c of cuentas) {
    fechaInicialPorCuenta.set(c.id, c.saldo_inicial_fecha)
  }

  // Agregar movimientos por cuenta_id, SOLO los posteriores (incluyendo mismo día)
  const movs = new Map<string, { im: number; iu: number; gm: number; gu: number }>()
  for (const t of txs) {
    if (!t.cuenta_id) continue
    const fechaInicial = fechaInicialPorCuenta.get(t.cuenta_id)
    // Si la cuenta tiene saldo inicial, ignorar tx ANTES del día inicial
    // El mismo día SÍ cuenta (capturas saldo en la mañana y haces gastos en la tarde)
    if (fechaInicial && t.fecha < fechaInicial) continue

    const monto = Number(t.monto) || 0
    if (!movs.has(t.cuenta_id)) movs.set(t.cuenta_id, { im: 0, iu: 0, gm: 0, gu: 0 })
    const m = movs.get(t.cuenta_id)!
    const esGasto = t.tipo === 'gasto' || t.tipo === 'multa_interna'
    const esIngreso = t.tipo === 'ingreso'
    if (t.moneda === 'USD') {
      if (esIngreso) m.iu += monto
      else if (esGasto) m.gu += monto
    } else {
      if (esIngreso) m.im += monto
      else if (esGasto) m.gm += monto
    }
  }

  const por_cuenta: SaldosCuenta[] = cuentas.map((c) => {
    const m = movs.get(c.id) ?? { im: 0, iu: 0, gm: 0, gu: 0 }
    const ini_mxn = Number(c.saldo_inicial_mxn ?? 0)
    const ini_usd = Number(c.saldo_inicial_usd ?? 0)
    const locked = !!c.saldo_inicial_locked
    const saldo_mxn = locked ? ini_mxn + m.im - m.gm : 0
    const saldo_usd = locked ? ini_usd + m.iu - m.gu : 0
    const saldo_total_mxn = saldo_mxn + saldo_usd * fx
    return {
      cuenta_id: c.id,
      nombre: c.nombre,
      titular: c.titular,
      tipo: c.tipo,
      moneda: c.moneda,
      ingresos_mxn: m.im,
      ingresos_usd: m.iu,
      gastos_mxn: m.gm,
      gastos_usd: m.gu,
      saldo_inicial_mxn: ini_mxn,
      saldo_inicial_usd: ini_usd,
      saldo_mxn,
      saldo_usd,
      saldo_total_mxn,
      locked,
      fecha_inicial: c.saldo_inicial_fecha,
      notas_inicial: c.saldo_inicial_notas,
    }
  })

  const total_solo_mxn = por_cuenta.reduce((s, c) => s + c.saldo_mxn, 0)
  const total_solo_usd = por_cuenta.reduce((s, c) => s + c.saldo_usd, 0)
  const total_mxn = total_solo_mxn + total_solo_usd * fx

  return { total_mxn, total_solo_mxn, total_solo_usd, por_cuenta }
}
