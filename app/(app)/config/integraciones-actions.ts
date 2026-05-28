'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validarTokenMP, sincronizarPagosMP } from '@/lib/integraciones/mercadopago'

export type IntegState = { ok?: boolean; error?: string; integ_id?: string }

export async function agregarIntegracionMP(_prev: IntegState, formData: FormData): Promise<IntegState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const nombre = String(formData.get('nombre') || '').trim()
  const accessToken = String(formData.get('access_token') || '').trim()
  const cuentaId = String(formData.get('cuenta_id') || '').trim() || null
  const negocioId = String(formData.get('negocio_default_id') || '').trim() || null

  if (!nombre || !accessToken) return { error: 'Falta nombre o access token' }

  // Validar el token contra MP
  const val = await validarTokenMP(accessToken)
  if (!val.ok) return { error: `Token inválido: ${val.error}` }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('integraciones_mp')
    .insert({
      nombre,
      access_token: accessToken,
      cuenta_id: cuentaId,
      negocio_default_id: negocioId,
      mp_user_id: val.userId,
      activa: true,
    })
    .select('id')
    .single()

  if (error) {
    if (/relation.*does not exist/i.test(error.message)) {
      return { error: 'Falta pegar migración 0024_integraciones.sql' }
    }
    return { error: error.message }
  }

  revalidatePath('/config')
  return { ok: true, integ_id: data.id }
}

export async function sincronizarMPAhora(integId: string): Promise<IntegState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const r = await sincronizarPagosMP(integId)
  if (r.error) return { error: r.error }
  revalidatePath('/config')
  revalidatePath('/cashflow')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function toggleIntegracionMP(integId: string, activa: boolean): Promise<IntegState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  await admin.from('integraciones_mp').update({ activa }).eq('id', integId)
  revalidatePath('/config')
  return { ok: true }
}

export async function eliminarIntegracionMP(integId: string): Promise<IntegState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  await admin.from('integraciones_mp').delete().eq('id', integId)
  revalidatePath('/config')
  return { ok: true }
}

// ============================================================
// WhatsApp: autorizar números
// ============================================================
export async function agregarNumeroWhatsApp(_prev: IntegState, formData: FormData): Promise<IntegState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const numero = String(formData.get('numero') || '').replace(/[^0-9]/g, '')
  const nombre = String(formData.get('nombre') || '').trim()
  const profileId = String(formData.get('profile_id') || '').trim() || null
  if (numero.length < 10) return { error: 'Número inválido (incluye lada país, ej: 521624...)' }

  const admin = createAdminClient()
  const { error } = await admin.from('whatsapp_autorizados').insert({
    numero,
    nombre: nombre || null,
    profile_id: profileId,
    activo: true,
  })
  if (error) {
    if (/relation.*does not exist/i.test(error.message)) {
      return { error: 'Falta pegar migración 0024_integraciones.sql' }
    }
    if (/duplicate/i.test(error.message)) return { error: 'Ese número ya está autorizado' }
    return { error: error.message }
  }
  revalidatePath('/config')
  return { ok: true }
}
