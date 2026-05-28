/**
 * WhatsApp Business Cloud API — captura por audio/foto/texto.
 * Flujo: mensaje entra → (audio→Whisper) → Claude interpreta → crea tx → responde.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { aMxnEquivalente } from '@/lib/fx/server'
import { hoyEnCabos } from '@/lib/fechas'
import { getAIProvider } from '@/lib/ai/provider'
import { openai, OPENAI_MODEL } from '@/lib/ai/openai'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'

const GRAPH = 'https://graph.facebook.com/v21.0'

function waToken() { return process.env.WHATSAPP_ACCESS_TOKEN || '' }
function waPhoneId() { return process.env.WHATSAPP_PHONE_NUMBER_ID || '' }

/**
 * Envía un mensaje de texto por WhatsApp.
 */
export async function enviarWhatsApp(to: string, texto: string): Promise<void> {
  const token = waToken()
  const phoneId = waPhoneId()
  if (!token || !phoneId) return
  try {
    await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: texto.slice(0, 4000) },
      }),
    })
  } catch { /* best effort */ }
}

/**
 * Descarga media (audio/imagen) de WhatsApp y devuelve el buffer + mime.
 */
async function descargarMedia(mediaId: string): Promise<{ buffer: Buffer; mime: string } | null> {
  const token = waToken()
  if (!token) return null
  try {
    // 1) obtener URL del media
    const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const meta = await metaRes.json()
    if (!meta.url) return null
    // 2) descargar el binario
    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } })
    const arrayBuf = await fileRes.arrayBuffer()
    return { buffer: Buffer.from(arrayBuf), mime: meta.mime_type || 'application/octet-stream' }
  } catch {
    return null
  }
}

/**
 * Transcribe audio con Whisper (OpenAI — Claude no hace audio).
 */
export async function transcribirAudio(mediaId: string): Promise<string | null> {
  const media = await descargarMedia(mediaId)
  if (!media) return null
  try {
    const file = new File([new Uint8Array(media.buffer)], 'audio.ogg', { type: media.mime || 'audio/ogg' })
    const tr = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'es',
    })
    return tr.text || null
  } catch {
    return null
  }
}

/**
 * Descarga imagen y la devuelve como data URL base64 (para vision).
 */
export async function imagenADataUrl(mediaId: string): Promise<string | null> {
  const media = await descargarMedia(mediaId)
  if (!media) return null
  const b64 = media.buffer.toString('base64')
  return `data:${media.mime};base64,${b64}`
}

export type TxInterpretada = {
  es_transaccion: boolean
  tipo: 'ingreso' | 'gasto' | null
  monto: number | null
  moneda: 'MXN' | 'USD'
  concepto: string | null
  negocio_nombre: string | null
  cuenta_nombre: string | null
  categoria: string | null
  atribuido_a_nombre: string | null
  respuesta: string  // qué responder al usuario
}

/**
 * Claude interpreta el texto/transcripción y extrae la transacción.
 */
export async function interpretarMensaje(
  texto: string,
  negocios: string[],
  cuentas: string[]
): Promise<TxInterpretada> {
  const system = `Eres el capturador de gastos/ingresos de Cabo Admin por WhatsApp.
Recibes un mensaje (texto o transcripción de voz) de Miguel o Sergio describiendo un movimiento.
Extrae la transacción. Negocios disponibles: ${negocios.join(', ')}.
Cuentas disponibles: ${cuentas.join(', ')}.

Reglas:
- Si NO es una transacción (saludo, pregunta), es_transaccion=false y responde amable.
- tipo: gasto o ingreso.
- Detecta moneda (default MXN; si dice dólares/USD/dlls → USD).
- negocio_nombre: el más parecido de la lista o null (Casa para gastos personales/hogar).
- cuenta_nombre: el más parecido o null.
- atribuido_a_nombre: solo si es gasto personal de Casa de un socio (Miguel/Sergio).
- respuesta: confirmación corta y natural en mexicano, ej: "✅ Registré gasto de $500 gasolina en MP Sergio".

Responde SOLO JSON: {"es_transaccion": bool, "tipo": "gasto"|"ingreso"|null, "monto": num|null, "moneda": "MXN"|"USD", "concepto": str|null, "negocio_nombre": str|null, "cuenta_nombre": str|null, "categoria": str|null, "atribuido_a_nombre": str|null, "respuesta": str}`

  try {
    let raw = '{}'
    if (getAIProvider() === 'anthropic') {
      const resp = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: texto }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      raw = (t && t.type === 'text' ? t.text : '{}').replace(/```json\s*|\s*```/g, '').trim()
    } else {
      const c = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: 400,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: texto }],
      })
      raw = c.choices[0]?.message?.content ?? '{}'
    }
    const p = JSON.parse(raw) as Partial<TxInterpretada>
    return {
      es_transaccion: !!p.es_transaccion,
      tipo: p.tipo ?? null,
      monto: p.monto != null ? Number(p.monto) : null,
      moneda: p.moneda === 'USD' ? 'USD' : 'MXN',
      concepto: p.concepto ?? null,
      negocio_nombre: p.negocio_nombre ?? null,
      cuenta_nombre: p.cuenta_nombre ?? null,
      categoria: p.categoria ?? null,
      atribuido_a_nombre: p.atribuido_a_nombre ?? null,
      respuesta: p.respuesta ?? 'No entendí, ¿puedes repetirlo?',
    }
  } catch {
    return {
      es_transaccion: false, tipo: null, monto: null, moneda: 'MXN',
      concepto: null, negocio_nombre: null, cuenta_nombre: null,
      categoria: null, atribuido_a_nombre: null,
      respuesta: 'Tuve un error procesando tu mensaje, inténtalo de nuevo.',
    }
  }
}

/**
 * Interpreta una FOTO de ticket/factura con Claude vision.
 */
export async function interpretarImagen(
  dataUrl: string,
  negocios: string[],
  cuentas: string[]
): Promise<TxInterpretada> {
  const instruccion = `Eres el capturador de Cabo Admin. Esta es una foto de un ticket, recibo o factura.
Extrae el gasto/ingreso. Negocios: ${negocios.join(', ')}. Cuentas: ${cuentas.join(', ')}.
Responde SOLO JSON con: es_transaccion, tipo, monto (total), moneda, concepto, negocio_nombre, cuenta_nombre, categoria, atribuido_a_nombre, respuesta (confirmación corta).`

  try {
    let raw = '{}'
    if (getAIProvider() === 'anthropic') {
      // Claude vision: separar el data URL
      const m = dataUrl.match(/^data:(.+?);base64,(.+)$/)
      if (!m) throw new Error('data url inválido')
      const resp = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: m[1] as 'image/jpeg', data: m[2] } },
            { type: 'text', text: instruccion },
          ],
        }],
      })
      const t = resp.content.find((b) => b.type === 'text')
      raw = (t && t.type === 'text' ? t.text : '{}').replace(/```json\s*|\s*```/g, '').trim()
    } else {
      const c = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: instruccion },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        }],
      })
      raw = (c.choices[0]?.message?.content ?? '{}').replace(/```json\s*|\s*```/g, '').trim()
    }
    const p = JSON.parse(raw) as Partial<TxInterpretada>
    return {
      es_transaccion: !!p.es_transaccion,
      tipo: p.tipo ?? 'gasto',
      monto: p.monto != null ? Number(p.monto) : null,
      moneda: p.moneda === 'USD' ? 'USD' : 'MXN',
      concepto: p.concepto ?? null,
      negocio_nombre: p.negocio_nombre ?? null,
      cuenta_nombre: p.cuenta_nombre ?? null,
      categoria: p.categoria ?? null,
      atribuido_a_nombre: p.atribuido_a_nombre ?? null,
      respuesta: p.respuesta ?? 'Vi la foto pero no pude extraer el monto.',
    }
  } catch {
    return {
      es_transaccion: false, tipo: null, monto: null, moneda: 'MXN',
      concepto: null, negocio_nombre: null, cuenta_nombre: null,
      categoria: null, atribuido_a_nombre: null,
      respuesta: 'No pude leer la foto. Manda el monto por texto.',
    }
  }
}

/**
 * Crea la transacción a partir de la interpretación. Resuelve nombres a IDs.
 */
export async function crearTxDesdeWhatsApp(
  interp: TxInterpretada,
  capturadoPor: string | null
): Promise<{ ok: boolean; txId?: string; error?: string }> {
  if (!interp.es_transaccion || !interp.monto || !interp.tipo) {
    return { ok: false, error: 'No es transacción válida' }
  }
  const admin = createAdminClient()
  const [{ data: negocios }, { data: cuentas }, { data: socios }] = await Promise.all([
    admin.from('negocios').select('id, nombre').eq('activo', true),
    admin.from('cuentas').select('id, nombre').eq('activo', true),
    admin.from('profiles').select('id, nombre').eq('activo', true),
  ])
  const match = (list: { id: string; nombre: string }[] | null, hint: string | null) => {
    if (!hint || !list) return null
    const h = hint.toLowerCase()
    return list.find((x) => x.nombre.toLowerCase().includes(h) || h.includes(x.nombre.toLowerCase()))?.id ?? null
  }
  let negocioId = match(negocios, interp.negocio_nombre)
  // Default: negocio "General" si no hay match
  if (!negocioId) negocioId = (negocios ?? []).find((n) => /general/i.test(n.nombre))?.id ?? (negocios ?? [])[0]?.id ?? null
  const cuentaId = match(cuentas, interp.cuenta_nombre)
  const atribuidoA = match(socios, interp.atribuido_a_nombre)

  if (!negocioId) return { ok: false, error: 'No hay negocio' }

  const fecha = hoyEnCabos()
  const fx = await aMxnEquivalente(interp.monto, interp.moneda, fecha)

  const { data: tx, error } = await admin.from('transacciones').insert({
    tipo: interp.tipo,
    monto: interp.monto,
    moneda: interp.moneda,
    monto_mxn_equivalente: fx.monto_mxn_equivalente,
    tipo_cambio_usado: fx.tipo_cambio_usado,
    fecha,
    negocio_id: negocioId,
    cuenta_id: cuentaId,
    categoria: interp.categoria,
    concepto: interp.concepto || 'Captura WhatsApp',
    atribuido_a: atribuidoA,
    metodo_pago: 'otro',
    metodo_captura: 'voz',
    capturado_por: capturadoPor,
    notas: 'Capturado por WhatsApp',
  }).select('id').single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, txId: tx?.id }
}
