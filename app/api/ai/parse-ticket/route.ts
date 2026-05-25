import { NextResponse } from 'next/server'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'
import { PROMPT_TICKET, type TicketParsed } from '@/lib/ai/prompts'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

function extractJSON(text: string): unknown {
  const trimmed = text.trim()
  // Si viene envuelto en ```json … ```, lo limpiamos
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const raw = fence ? fence[1] : trimmed
  return JSON.parse(raw)
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 })
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Tipo de archivo no soportado' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
    const path = `${user.id}/${Date.now()}.${ext}`

    // Subir a Supabase Storage con service role (bypassa RLS)
    const admin = createAdminClient()
    const { error: upErr } = await admin.storage.from('recibos').upload(path, buf, {
      contentType: file.type,
      upsert: false,
    })
    if (upErr) {
      return NextResponse.json({ error: `Upload: ${upErr.message}` }, { status: 500 })
    }

    // URL firmada para que la UI pueda mostrarla luego (1 hora)
    const { data: signed } = await admin.storage.from('recibos').createSignedUrl(path, 3600)

    // Llamar a Claude con vision + prompt cacheable
    const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
    const base64 = buf.toString('base64')

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: PROMPT_TICKET,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: 'Extrae los datos de esta imagen y devuelve solo el JSON.',
            },
          ],
        },
      ],
    })

    const textBlock = message.content.find((c) => c.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'Respuesta vacía de IA' }, { status: 500 })
    }

    let parsed: TicketParsed
    try {
      parsed = extractJSON(textBlock.text) as TicketParsed
    } catch {
      return NextResponse.json(
        { error: 'No pude parsear la respuesta de IA', raw: textBlock.text },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      parsed,
      foto_path: path,
      foto_url: signed?.signedUrl ?? null,
      cache_stats: {
        cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
