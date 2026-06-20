/**
 * Analiza un voice_event con Claude Sonnet.
 * Solo dispara push a admin si el análisis es significativo.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'
import { enviarPushAProfiles } from '@/lib/push/server'
import { logError } from '@/lib/logger/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BodySchema = z.object({
  voice_event_id: z.string().uuid(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const admin = createAdminClient()

  const { data: evento } = await admin
    .from('voice_events')
    .select('*')
    .eq('id', parsed.data.voice_event_id)
    .single()
  if (!evento) return NextResponse.json({ error: 'Evento no encontrado' }, { status: 404 })

  const prompt = `Analiza esta conversación capturada en el POS de una farmacia en Baja California Sur.

CATEGORIA DETECTADA: ${evento.categoria}
KEYWORD: "${evento.keyword}"
TRANSCRIPCIÓN: "${evento.transcript}"

Tu tarea: Resumir lo que está pasando entre cajera y cliente, evaluar el tono, recomendar acción.

Responde SOLO con JSON válido, sin markdown:
{
  "resumen": "string max 150 chars describiendo lo que pasa",
  "tono": "normal" | "tenso" | "queja" | "positivo",
  "accion": "nada" | "revisar" | "urgente",
  "alerta_admin": boolean
}

Reglas:
- accion="urgente" + alerta=true: cliente molesto, fraude sospechoso, queja grave
- accion="revisar" + alerta=true: cancelación grande, devolución, fiado importante
- accion="nada" + alerta=false: cliente solo preguntando precio, conversación normal`

  let resultado: { resumen: string; tono: string; accion: string; alerta_admin: boolean } | null = null
  try {
    const resp = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = resp.content
      .flatMap(b => b.type === 'text' ? [b.text] : [])
      .join('\n')
      .trim()
    const match = text.match(/\{[\s\S]*\}/)
    if (match) resultado = JSON.parse(match[0])
  } catch (e) {
    await logError('ai/analizar-voz', e, { voice_event_id: evento.id })
    return NextResponse.json({ error: 'IA falló' }, { status: 500 })
  }

  if (!resultado) return NextResponse.json({ error: 'IA sin JSON' }, { status: 500 })

  // Guardar análisis
  await admin
    .from('voice_events')
    .update({
      analisis_resumen: resultado.resumen,
      analisis_tono: resultado.tono,
      analisis_accion: resultado.accion,
      analisis_at: new Date().toISOString(),
    })
    .eq('id', evento.id as string)

  // Push a admin/socio si la IA recomienda alerta
  if (resultado.alerta_admin) {
    try {
      const { data: admins } = await admin
        .from('profiles')
        .select('id, roles(nombre)')
        .eq('activo', true)
      const adminIds = (admins ?? [])
        .filter(p => {
          const r = (p.roles as unknown as { nombre: string } | null)?.nombre
          return r === 'admin' || r === 'socio'
        })
        .map(p => p.id as string)

      if (adminIds.length > 0) {
        const emoji = resultado.accion === 'urgente' ? '🚨' : '⚠️'
        const categoriaLabel = {
          precio: '💲', cancelacion: '🚫', devolucion: '↩️',
          problema: '😡', fiado: '📝', general: 'ℹ️',
        }[evento.categoria as string] ?? 'ℹ️'

        await enviarPushAProfiles(adminIds, {
          title: `${emoji} ${categoriaLabel} ${evento.categoria?.toUpperCase()} · ${evento.profile_nombre}`,
          body: resultado.resumen,
          url: '/pos/voice',
          tag: `voice-${evento.id}`,
        })
        await admin
          .from('voice_events')
          .update({ notificado_push: true })
          .eq('id', evento.id as string)
      }
    } catch { /* silent */ }
  }

  return NextResponse.json({ ok: true, ...resultado })
}
