'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type SavePayload = {
  tipo: 'ingreso' | 'gasto'
  monto: number
  moneda: 'MXN' | 'USD'
  fecha: string
  negocio_id: string
  cuenta_id: string
  metodo_pago?: string | null
  categoria?: string | null
  concepto?: string | null
  notas?: string | null
  metodo_captura: 'foto' | 'voz' | 'manual'
  foto_url?: string | null
  audio_url?: string | null
  raw_ai_response?: unknown
}

export async function saveAITransaccion(payload: SavePayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const { error, data } = await supabase
    .from('transacciones')
    .insert({
      ...payload,
      capturado_por: user.id,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/transacciones')
  revalidatePath('/dashboard')
  revalidatePath('/chat')
  return { ok: true, id: data.id }
}
