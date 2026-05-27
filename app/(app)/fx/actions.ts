'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUsdMxn } from '@/lib/fx/fetch'

export async function guardarRateManual(fecha: string, rate: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('fx_rates')
    .upsert({
      fecha,
      rate_compra: rate,
      source: 'manual',
      manual: true,
      capturado_por: user.id,
      fetched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'fecha' })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/fx')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function refrescarRateAPI() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const fetched = await fetchUsdMxn()
  if (!fetched) return { ok: false, error: 'No respondió ninguna API pública' }

  return { ok: true, rate: fetched.rate_compra, source: fetched.source }
}
