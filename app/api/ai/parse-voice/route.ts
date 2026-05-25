import { NextResponse } from 'next/server'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'
import { openai } from '@/lib/ai/openai'
import { PROMPT_VOZ, type VozParsed } from '@/lib/ai/prompts'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { hoyEnCabos } from '@/lib/fechas'

export const runtime = 'nodejs'
export const maxDuration = 60

function extractJSON(text: string): unknown {
  const trimmed = text.trim()
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

    const buf = Buffer.from(await file.arrayBuffer())
    const ext = (file.type.split('/')[1] || 'webm').replace(/[^a-z0-9]/gi, '')
    const path = `${user.id}/${Date.now()}.${ext}`

    // Subir a Storage (admin bypasa RLS)
    const admin = createAdminClient()
    const { error: upErr } = await admin.storage.from('audios').upload(path, buf, {
      contentType: file.type || 'audio/webm',
      upsert: false,
    })
    if (upErr) {
      return NextResponse.json({ error: `Upload: ${upErr.message}` }, { status: 500 })
    }
    const { data: signed } = await admin.storage.from('audios').createSignedUrl(path, 3600)

    // Whisper para transcribir
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'es',
    })

    const texto = transcription.text?.trim() || ''
    if (!texto) {
      return NextResponse.json({ error: 'No se detectó voz' }, { status: 422 })
    }

    // Claude para extraer JSON estructurado
    const systemText = PROMPT_VOZ.replace('{FECHA_HOY}', hoyEnCabos())
    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system: [
        { type: 'text', text: systemText, cache_control: { type: 'ephemeral' } },
      ],
      messages: [
        { role: 'user', content: `Transcripción del usuario:\n"${texto}"` },
      ],
    })

    const textBlock = message.content.find((c) => c.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'Respuesta vacía de IA' }, { status: 500 })
    }

    let parsed: VozParsed
    try {
      parsed = extractJSON(textBlock.text) as VozParsed
    } catch {
      return NextResponse.json(
        { error: 'No pude parsear la respuesta de IA', transcripcion: texto, raw: textBlock.text },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      transcripcion: texto,
      parsed,
      audio_path: path,
      audio_url: signed?.signedUrl ?? null,
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
