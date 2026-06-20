'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logError } from '@/lib/logger/server'

const GuardarSchema = z.object({
  keyword: z.string().min(1).max(60),
  categoria: z.enum(['precio', 'cancelacion', 'devolucion', 'problema', 'fiado', 'general']),
  transcript: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1).optional(),
})

export type GuardarResult = { ok?: boolean; error?: string; id?: string }

export async function guardarVoiceEvent(input: z.infer<typeof GuardarSchema>): Promise<GuardarResult> {
  const parsed = GuardarSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  try {
    const { data: prof } = await admin
      .from('profiles')
      .select('nombre')
      .eq('id', user.id)
      .single()

    const { data: negocio } = await admin
      .from('negocios')
      .select('id')
      .ilike('nombre', '%cvu pharmacy local%')
      .maybeSingle()

    const { data, error } = await admin
      .from('voice_events')
      .insert({
        profile_id: user.id,
        profile_nombre: (prof?.nombre as string) ?? null,
        negocio_id: negocio?.id ?? null,
        keyword: parsed.data.keyword,
        categoria: parsed.data.categoria,
        transcript: parsed.data.transcript,
        confidence: parsed.data.confidence ?? null,
      })
      .select('id')
      .single()

    if (error) {
      await logError('voice-actions/guardar', error, { keyword: parsed.data.keyword })
      return { error: error.message }
    }

    return { ok: true, id: data.id as string }
  } catch (e) {
    await logError('voice-actions/guardar', e, { keyword: parsed.data.keyword })
    return { error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}
