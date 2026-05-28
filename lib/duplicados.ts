/**
 * Detector de transacciones duplicadas.
 * Heurística: misma cuenta + mismo monto + mismo signo + fecha ±2 días.
 * Devuelve hasta 3 candidatos de tx existentes que parecen duplicados.
 */
import { createAdminClient } from '@/lib/supabase/admin'

export type DuplicadoCandidato = {
  id: string
  tipo: string
  monto: number
  moneda: string
  fecha: string
  concepto: string | null
  categoria: string | null
  cuenta_nombre: string | null
  diasDiff: number
}

export async function buscarDuplicados(args: {
  tipo: 'ingreso' | 'gasto'
  monto: number
  moneda: 'MXN' | 'USD'
  fecha: string  // YYYY-MM-DD
  cuenta_id: string | null
  negocio_id: string | null
  ignorarTxId?: string | null  // para edit, no consideres la misma tx
}): Promise<DuplicadoCandidato[]> {
  if (!args.cuenta_id) return []

  const admin = createAdminClient()

  // Ventana de fechas ±2 días
  const fechaDate = new Date(args.fecha + 'T00:00:00')
  const desde = new Date(fechaDate)
  desde.setDate(fechaDate.getDate() - 2)
  const hasta = new Date(fechaDate)
  hasta.setDate(fechaDate.getDate() + 2)
  const desdeStr = desde.toISOString().slice(0, 10)
  const hastaStr = hasta.toISOString().slice(0, 10)

  // Tolerancia del monto: ±0.5% o $1 mínimo
  const tolerancia = Math.max(args.monto * 0.005, 1)
  const min = args.monto - tolerancia
  const max = args.monto + tolerancia

  let q = admin
    .from('transacciones')
    .select('id, tipo, monto, moneda, fecha, concepto, categoria, cuenta_id, cuentas(nombre)')
    .eq('tipo', args.tipo)
    .eq('moneda', args.moneda)
    .eq('cuenta_id', args.cuenta_id)
    .gte('monto', min)
    .lte('monto', max)
    .gte('fecha', desdeStr)
    .lte('fecha', hastaStr)
    .limit(5)

  if (args.ignorarTxId) q = q.neq('id', args.ignorarTxId)

  const { data } = await q
  if (!data) return []

  return data.map((t) => {
    const txDate = new Date(t.fecha + 'T00:00:00')
    const diasDiff = Math.round((txDate.getTime() - fechaDate.getTime()) / (1000 * 60 * 60 * 24))
    const cta = t.cuentas as unknown as { nombre: string } | null
    return {
      id: t.id,
      tipo: t.tipo,
      monto: Number(t.monto),
      moneda: t.moneda,
      fecha: t.fecha,
      concepto: t.concepto,
      categoria: t.categoria,
      cuenta_nombre: cta?.nombre ?? null,
      diasDiff,
    }
  }).slice(0, 3)
}
