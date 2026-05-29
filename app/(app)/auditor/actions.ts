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

// ============================================================
// Observaciones del feed (auditor_observaciones)
// ============================================================
export async function marcarObservacion(id: string, estado: 'vista' | 'resuelta' | 'archivada') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('auditor_observaciones')
    .update({ estado, visto_por: user.id, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/auditor')
  return { ok: true }
}

// Responder una pregunta del auditor → se cierra Y se guarda en memoria (aprende)
export async function responderPendiente(id: string, respuesta: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }
  const texto = respuesta.trim()
  if (!texto) return { ok: false, error: 'Escribe una respuesta' }

  const admin = createAdminClient()
  const { data: pend } = await admin
    .from('auditor_pendientes')
    .select('pregunta')
    .eq('id', id)
    .single()

  await admin
    .from('auditor_pendientes')
    .update({ estado: 'contestada', respuesta: texto, contestada_at: new Date().toISOString() })
    .eq('id', id)

  // Aprende: guarda la respuesta como memoria
  await admin.from('memoria_ia').insert({
    tipo: 'hecho',
    contenido: pend?.pregunta ? `${pend.pregunta} → ${texto}` : texto,
    ambito: 'general',
    importancia: 6,
    capturado_por: user.id,
  })

  revalidatePath('/auditor')
  return { ok: true }
}

// ============================================================
// Memoria del auditor (memoria_ia)
// ============================================================
export async function agregarMemoria(contenido: string, importancia = 6) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }
  const texto = contenido.trim()
  if (!texto) return { ok: false, error: 'Escribe algo para recordar' }

  const admin = createAdminClient()
  const { error } = await admin.from('memoria_ia').insert({
    tipo: 'contexto',
    contenido: texto,
    ambito: 'general',
    importancia,
    capturado_por: user.id,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/auditor')
  return { ok: true }
}

export async function borrarMemoria(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }
  const admin = createAdminClient()
  const { error } = await admin.from('memoria_ia').update({ activa: false }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/auditor')
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
