/**
 * Webhook de WhatsApp Business Cloud API.
 * GET  → verificación del webhook (Meta manda hub.challenge)
 * POST → mensajes entrantes (texto, audio, imagen)
 *
 * Solo procesa mensajes de números autorizados (whatsapp_autorizados).
 * Flujo: mensaje → IA interpreta → crea tx → responde por WhatsApp.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  enviarWhatsApp, transcribirAudio, imagenADataUrl,
  interpretarMensaje, interpretarImagen, crearTxDesdeWhatsApp,
} from '@/lib/integraciones/whatsapp'
import { formatMoney } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 60

// ---- Verificación del webhook (Meta) ----
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 })
  }
  return NextResponse.json({ error: 'verificación fallida' }, { status: 403 })
}

// ---- Mensajes entrantes ----
export async function POST(req: Request) {
  let body: WAWebhookBody
  try { body = await req.json() } catch { return NextResponse.json({ received: true }) }

  // Estructura: entry[].changes[].value.messages[]
  try {
    const admin = createAdminClient()
    const entry = body.entry?.[0]
    const change = entry?.changes?.[0]
    const value = change?.value
    const mensajes = value?.messages ?? []

    for (const msg of mensajes) {
      const from = msg.from  // número del remitente
      const waMsgId = msg.id

      // Dedup: ¿ya procesamos este mensaje?
      const { data: yaProc } = await admin
        .from('whatsapp_mensajes')
        .select('id')
        .eq('wa_message_id', waMsgId)
        .maybeSingle()
      if (yaProc) continue

      // ¿Número autorizado?
      const { data: autorizado } = await admin
        .from('whatsapp_autorizados')
        .select('profile_id, activo, nombre')
        .eq('numero', from)
        .eq('activo', true)
        .maybeSingle()

      if (!autorizado) {
        await admin.from('whatsapp_mensajes').insert({
          wa_message_id: waMsgId, from_number: from, tipo: msg.type,
          estado: 'ignorado', contenido: 'Número no autorizado',
        })
        await enviarWhatsApp(from, '🔒 Este número no está autorizado para capturar en Cabo Admin. Pide que te den de alta en Configuración.')
        continue
      }

      // Contexto (negocios + cuentas)
      const [{ data: negocios }, { data: cuentas }] = await Promise.all([
        admin.from('negocios').select('nombre').eq('activo', true),
        admin.from('cuentas').select('nombre').eq('activo', true),
      ])
      const negNombres = (negocios ?? []).map((n) => n.nombre)
      const ctaNombres = (cuentas ?? []).map((c) => c.nombre)

      let interp
      let contenido = ''

      if (msg.type === 'text') {
        contenido = msg.text?.body ?? ''
        interp = await interpretarMensaje(contenido, negNombres, ctaNombres)
      } else if (msg.type === 'audio') {
        const mediaId = msg.audio?.id
        contenido = mediaId ? (await transcribirAudio(mediaId)) ?? '' : ''
        if (!contenido) {
          await enviarWhatsApp(from, '🎤 No pude transcribir el audio, mándalo por texto.')
          continue
        }
        interp = await interpretarMensaje(contenido, negNombres, ctaNombres)
      } else if (msg.type === 'image') {
        const mediaId = msg.image?.id
        const dataUrl = mediaId ? await imagenADataUrl(mediaId) : null
        if (!dataUrl) {
          await enviarWhatsApp(from, '📷 No pude descargar la foto, inténtalo de nuevo.')
          continue
        }
        contenido = '[imagen]'
        interp = await interpretarImagen(dataUrl, negNombres, ctaNombres)
      } else {
        await enviarWhatsApp(from, 'Solo entiendo texto, audio o fotos de tickets. 🙂')
        continue
      }

      // Crear tx si aplica
      let txId: string | undefined
      if (interp.es_transaccion && interp.monto && interp.tipo) {
        const res = await crearTxDesdeWhatsApp(interp, autorizado.profile_id)
        if (res.ok) {
          txId = res.txId
          const signo = interp.tipo === 'gasto' ? '−' : '+'
          await enviarWhatsApp(
            from,
            `✅ Registrado: ${signo}${formatMoney(interp.monto, interp.moneda)} ${interp.concepto || ''}\n${interp.negocio_nombre ? `🏢 ${interp.negocio_nombre}` : ''}\n\nSi algo está mal, edítalo en la app.`
          )
        } else {
          await enviarWhatsApp(from, `⚠️ No pude registrarlo: ${res.error}. Inténtalo en la app.`)
        }
      } else {
        await enviarWhatsApp(from, interp.respuesta)
      }

      // Log
      await admin.from('whatsapp_mensajes').insert({
        wa_message_id: waMsgId,
        from_number: from,
        tipo: msg.type,
        contenido,
        interpretacion: interp as unknown as Record<string, unknown>,
        transaccion_id: txId ?? null,
        estado: txId ? 'procesado' : 'recibido',
      })
    }
  } catch (e) {
    console.error('WhatsApp webhook error:', e)
  }

  // Siempre 200 para que Meta no reintente
  return NextResponse.json({ received: true })
}

// ---- Tipos del payload de WhatsApp ----
type WAWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id: string
          from: string
          type: string
          text?: { body: string }
          audio?: { id: string }
          image?: { id: string }
        }>
      }
    }>
  }>
}
