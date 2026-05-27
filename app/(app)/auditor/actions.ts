'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Schema actual: estado in ('abierta', 'contestada', 'descartada')
// Mapeo: 'resuelta' (UI) → 'contestada' (DB)
export async function cerrarPendiente(id: string, accion: 'resuelta' | 'descartada') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const estadoBD = accion === 'resuelta' ? 'contestada' : 'descartada'

  const admin = createAdminClient()
  const { error } = await admin
    .from('auditor_pendientes')
    .update({
      estado: estadoBD,
      contestada_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/auditor')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function descartarTodosPendientes() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('auditor_pendientes')
    .update({
      estado: 'descartada',
      contestada_at: new Date().toISOString(),
    })
    .eq('estado', 'abierta')

  if (error) return { ok: false, error: error.message }

  revalidatePath('/auditor')
  revalidatePath('/dashboard')
  return { ok: true }
}
