import { NextResponse } from 'next/server'
import { requireSocio } from '@/lib/auth/require-socio'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'
import { openai, OPENAI_MODEL } from '@/lib/ai/openai'
import { getAIProvider } from '@/lib/ai/provider'
import { PROMPT_TICKET, type TicketParsed } from '@/lib/ai/prompts'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

function extractJSON(text: string): unknown {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const raw = fence ? fence[1] : trimmed
  return JSON.parse(raw)
}

async function parseConOpenAI(buf: Buffer, mediaType: string): Promise<TicketParsed> {
  const base64 = buf.toString('base64')
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: PROMPT_TICKET },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extrae los datos de esta imagen y devuelve solo el JSON.' },
          { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1024,
    temperature: 0.1,
  })
  const text = completion.choices[0]?.message?.content || ''
  return extractJSON(text) as TicketParsed
}

async function parseConAnthropic(buf: Buffer, mediaType: string): Promise<TicketParsed> {
  const base64 = buf.toString('base64')
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: [{ type: 'text', text: PROMPT_TICKET, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
              data: base64,
            },
          },
          { type: 'text', text: 'Extrae los datos de esta imagen y devuelve solo el JSON.' },
        ],
      },
    ],
  })
  const textBlock = message.content.find((c) => c.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Respuesta vacía de IA')
  return extractJSON(textBlock.text) as TicketParsed
}

export async function POST(req: Request) {
  try {
    const g = await requireSocio()
    if (g instanceof NextResponse) return g
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

    const admin = createAdminClient()
    const { error: upErr } = await admin.storage.from('recibos').upload(path, buf, {
      contentType: file.type,
      upsert: false,
    })
    if (upErr) {
      return NextResponse.json({ error: `Upload: ${upErr.message}` }, { status: 500 })
    }
    const { data: signed } = await admin.storage.from('recibos').createSignedUrl(path, 3600)

    let parsed: TicketParsed
    try {
      const provider = getAIProvider()
      parsed = provider === 'anthropic'
        ? await parseConAnthropic(buf, file.type)
        : await parseConOpenAI(buf, file.type)
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? `IA: ${e.message}` : 'IA: error desconocido' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      parsed,
      foto_path: path,
      foto_url: signed?.signedUrl ?? null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
