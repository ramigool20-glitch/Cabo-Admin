/**
 * Cliente para la Settlement Reports API de Mercado Pago.
 *
 * Flujo:
 *   1. solicitarReporte(token, desde, hasta) → MP genera el CSV (async)
 *   2. listarReportes(token) → ver status
 *   3. cuando status='processed', descargarReporte(token, file_name) → CSV
 *   4. Por cada SOURCE_ID extraído, llamar procesarPagoMP(id, integ_id)
 *      que ya hace todo: detecta dirección (ingreso/gasto), categoriza,
 *      crea push, registra comisiones, etc.
 *
 * NOTA: la config del reporte se crea con POST la primera vez. Después se
 * usa el PUT, pero MP es estricto con el formato. Aquí solo asumimos que
 * ya existe una config válida (creada vía script o el usuario).
 */

export type ReporteInfo = {
  id: number
  user_id: number
  status: 'pending' | 'processed' | 'error' | 'in_process'
  file_name: string
  begin_date: string
  end_date: string
  date_created: string
  report_type: string
  currency_id: string
}

const BASE = 'https://api.mercadopago.com/v1/account/settlement_report'

/**
 * Solicita generación de un reporte para un rango de fechas. Async — MP lo
 * genera en background y queda disponible cuando status='processed'.
 */
export async function solicitarReporteSettlement(
  accessToken: string,
  desde: Date,
  hasta: Date,
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      begin_date: desde.toISOString(),
      end_date: hasta.toISOString(),
    }),
  })
  if (!res.ok) {
    return { ok: false, error: `MP ${res.status}: ${(await res.text()).slice(0, 150)}` }
  }
  const data = await res.json() as { id: number; status: string }
  return { ok: true, id: data.id }
}

export async function listarReportes(accessToken: string): Promise<ReporteInfo[]> {
  const res = await fetch(`${BASE}/list`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []
  return await res.json() as ReporteInfo[]
}

export async function descargarReporte(accessToken: string, fileName: string): Promise<string> {
  const res = await fetch(`${BASE}/${fileName}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`MP download ${res.status}`)
  return await res.text()
}

/**
 * Parsea el CSV del settlement report. MP usa ; como separador.
 * Devuelve un array de objetos con las columnas.
 */
export function parsearCSV(csv: string): Record<string, string>[] {
  const lines = csv.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.length > 0)
  if (lines.length < 2) return []
  // Detectar separador (MP usa ;)
  const sep = lines[0].includes(';') ? ';' : ','
  const header = parseCsvLine(lines[0], sep)
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i], sep)
    const row: Record<string, string> = {}
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = cells[j] ?? ''
    }
    rows.push(row)
  }
  return rows
}

/** Parser CSV simple que respeta comillas (MP usa " para texto con espacios). */
function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let enQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      // Doble comilla escapada
      if (enQuote && line[i + 1] === '"') {
        cur += '"'
        i++
        continue
      }
      enQuote = !enQuote
      continue
    }
    if (c === sep && !enQuote) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

/**
 * Extrae los SOURCE_ID (mp_payment_id) de un CSV ya parseado.
 * Filtra los que no son numéricos (ej. movimientos internos no-payment).
 */
export function extraerSourceIds(rows: Record<string, string>[]): string[] {
  const out: string[] = []
  for (const r of rows) {
    const sid = r.SOURCE_ID || r.source_id || r['Source ID']
    if (sid && /^\d+$/.test(sid)) out.push(sid)
  }
  return out
}
