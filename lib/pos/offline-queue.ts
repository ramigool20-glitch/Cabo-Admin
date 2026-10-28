/**
 * Cola de ventas offline del POS.
 *
 * Cuando se pierde internet, en lugar de tronar las ventas se encolan en
 * localStorage. Cuando regresa conexión, se procesan en orden FIFO.
 *
 * Si una venta falla, se reintenta hasta 3 veces. Después se marca como
 * con error pero NO se borra (la cajera debe decidir).
 */

let ownerScope: string | null = null
export function setOfflineOwnerScope(id: string | null) { ownerScope = id }
function storageKey() { return ownerScope ? `pos:${ownerScope}:queue` : null }
const MAX_ATTEMPTS = 3

export type VentaInput = {
  clave_idempotencia: string
  fecha: string
  negocio_id: string
  cuenta_id: string
  metodo_pago: string | null
  concepto: string | null
  cliente_nombre: string | null
  notas: string | null
  items: Array<{
    producto_id: string | null
    nombre_snapshot: string
    codigo_barras_snapshot?: string | null
    categoria_snapshot?: string | null
    costo_unitario_snapshot_mxn: number | null
    cantidad: number
    precio_unitario_mxn: number
    descuento_pct: number
  }>
  descuento_global_pct: number
  descontar_stock: boolean
  no_redirect?: boolean
  moneda_cobro?: 'MXN' | 'USD'
}

export type VentaPendiente = {
  local_id: string
  ts: number
  input: VentaInput
  attempts: number
  ultimo_error?: string
}

function safeRead(): VentaPendiente[] {
  if (typeof window === 'undefined' || !storageKey()) return []
  try {
    const raw = localStorage.getItem(storageKey()!)
    if (!raw) return []
    const parsed = JSON.parse(raw) as VentaPendiente[]
    return Array.isArray(parsed) ? parsed.map(p => ({ ...p, input: { ...p.input, clave_idempotencia: p.input.clave_idempotencia ?? p.local_id } })) : []
  } catch {
    return []
  }
}

function safeWrite(cola: VentaPendiente[]): void {
  if (typeof window === 'undefined' || !storageKey()) throw new Error('Espera a que se verifique tu sesión antes de guardar la venta.')
  try {
    const encoded = JSON.stringify(cola)
    localStorage.setItem(storageKey()!, encoded)
    if (localStorage.getItem(storageKey()!) !== encoded) throw new Error('No se pudo verificar el guardado local')
  } catch {
    throw new Error('No se guardó la venta en este dispositivo. Conserva el ticket e intenta al recuperar conexión.')
  }
}

export function getCola(): VentaPendiente[] {
  return safeRead()
}

export function getColaSize(): number {
  return safeRead().length
}

export function agregarACola(input: VentaInput): VentaPendiente {
  const pendiente: VentaPendiente = {
    local_id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
    input,
    attempts: 0,
  }
  const cola = safeRead()
  cola.push(pendiente)
  safeWrite(cola)
  return pendiente
}

export function quitarDeCola(local_id: string): void {
  const cola = safeRead().filter(p => p.local_id !== local_id)
  safeWrite(cola)
}

export function marcarError(local_id: string, error: string): void {
  const cola = safeRead().map(p => p.local_id === local_id
    ? { ...p, attempts: p.attempts + 1, ultimo_error: error }
    : p)
  safeWrite(cola)
}

/**
 * Procesa la cola con la action proporcionada.
 * Retorna { exitosas, fallidas, errores }
 */
export async function procesarCola(
  procesar: (input: VentaInput) => Promise<{ error?: string; id?: string; ok?: boolean }>,
  onProgress?: (idx: number, total: number) => void,
): Promise<{ exitosas: number; fallidas: number; errores: string[] }> {
  const cola = safeRead()
  if (cola.length === 0) return { exitosas: 0, fallidas: 0, errores: [] }

  let exitosas = 0
  let fallidas = 0
  const errores: string[] = []

  for (let i = 0; i < cola.length; i++) {
    const p = cola[i]
    onProgress?.(i + 1, cola.length)

    if (p.attempts >= MAX_ATTEMPTS) {
      fallidas++
      errores.push(`(skip max attempts) ${p.ultimo_error ?? 'unknown'}`)
      continue
    }

    try {
      const r = await procesar(p.input)
      if (r?.error) {
        marcarError(p.local_id, r.error)
        fallidas++
        errores.push(r.error)
      } else if (r?.ok === true && r.id) {
        quitarDeCola(p.local_id)
        exitosas++
      } else {
        marcarError(p.local_id, 'El servidor no confirmó el guardado de la venta')
        fallidas++
        errores.push('Venta sin confirmación')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      // NEXT_REDIRECT no es error real
      {
        marcarError(p.local_id, msg)
        fallidas++
        errores.push(msg)
      }
    }
  }

  return { exitosas, fallidas, errores }
}
