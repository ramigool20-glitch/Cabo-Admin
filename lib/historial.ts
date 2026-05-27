import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Campos relevantes que rastreamos en el historial.
 * No incluimos timestamps internos (created_at, updated_at) ni IDs internos.
 */
const CAMPOS_RASTREADOS = [
  'tipo', 'monto', 'moneda', 'fecha',
  'concepto', 'categoria', 'metodo_pago', 'notas',
  'negocio_id', 'cuenta_id', 'atribuido_a',
  'monto_mxn_equivalente', 'tipo_cambio_usado',
] as const

type TxLike = Record<string, unknown>

/**
 * Computa el diff entre dos versiones de una transacción.
 * Solo incluye campos que cambiaron.
 */
function computeDiff(antes: TxLike, despues: TxLike): Record<string, { antes: unknown; despues: unknown }> {
  const diff: Record<string, { antes: unknown; despues: unknown }> = {}
  for (const campo of CAMPOS_RASTREADOS) {
    const a = antes[campo]
    const d = despues[campo]
    // Comparación tolerante a tipos: null/undefined/"" se consideran iguales
    const norm = (v: unknown) => (v === null || v === undefined || v === '') ? null : v
    if (norm(a) !== norm(d)) {
      diff[campo] = { antes: a ?? null, despues: d ?? null }
    }
  }
  return diff
}

/**
 * Filtra un objeto para guardar solo los campos relevantes (sin meta).
 */
function snapshot(tx: TxLike): TxLike {
  const out: TxLike = {}
  for (const campo of CAMPOS_RASTREADOS) {
    if (campo in tx) out[campo] = tx[campo]
  }
  return out
}

/**
 * Registra una entrada de historial.
 * - 'creada': solo snapshot del estado nuevo
 * - 'editada': diff de campos cambiados + snapshot post-edición
 * - 'eliminada': snapshot del estado al borrar
 */
export async function registrarHistorial(
  transaccionId: string,
  accion: 'creada' | 'editada' | 'eliminada',
  modificadaPor: string,
  antes: TxLike | null,
  despues: TxLike | null,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const snap = snapshot(despues ?? antes ?? {})
    let cambios: Record<string, { antes: unknown; despues: unknown }> | null = null
    if (accion === 'editada' && antes && despues) {
      cambios = computeDiff(antes, despues)
      // Si no hubo cambios reales, no registramos (evita ruido)
      if (Object.keys(cambios).length === 0) return
    }
    await admin.from('transaccion_historial').insert({
      transaccion_id: transaccionId,
      modificada_por: modificadaPor,
      accion,
      cambios,
      snapshot: snap,
    })
  } catch {
    // El historial es secundario; no debe bloquear la operación principal
  }
}
