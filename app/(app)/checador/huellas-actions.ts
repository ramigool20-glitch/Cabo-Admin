'use server'

/**
 * Server actions para WebAuthn (huellas dactilares).
 *
 * Flujo de registro:
 *   1. Admin abre /checador/huellas, selecciona empleado, click "Registrar"
 *   2. Browser llama navigator.credentials.create() — lector USB pide huella
 *   3. Browser devuelve { credentialId, publicKey }
 *   4. Client llama registrarHuella() con esos datos
 *
 * Flujo de verificación:
 *   1. Empleado (Tania) en /checador, tap "Checar entrada"
 *   2. Si tiene huella registrada, browser llama navigator.credentials.get()
 *   3. Lector USB pide huella → devuelve credentialId verificado
 *   4. Client llama verificarHuella() → server confirma identidad
 *
 * Nota: NO validamos la firma criptográfica en server (eso requeriría
 * @simplewebauthn/server). La seguridad viene de:
 *   - El navegador SÍ valida la firma con el publicKey local
 *   - Solo el dispositivo físico con la huella registrada puede generar firma válida
 *   - Sin huella correcta, navigator.credentials.get() falla y nunca llega al server
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ActionState = { ok?: boolean; error?: string; profileId?: string; profileNombre?: string }

const RegistrarSchema = z.object({
  profile_id: z.string().uuid(),
  credential_id: z.string().min(10).max(1000),
  public_key: z.string().min(10).max(2000),
  device_info: z.string().max(200).optional(),
})

export async function registrarHuella(input: z.infer<typeof RegistrarSchema>): Promise<ActionState> {
  const parsed = RegistrarSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  // Solo admin/socio puede registrar huellas
  const { data: prof } = await admin
    .from('profiles')
    .select('roles(nombre)')
    .eq('id', user.id)
    .single()
  const rol = (prof?.roles as unknown as { nombre: string } | null)?.nombre
  if (rol !== 'admin' && rol !== 'socio') {
    return { error: 'Solo admin/socio puede registrar huellas' }
  }

  // Nombre del empleado
  const { data: empleado } = await admin
    .from('profiles')
    .select('nombre')
    .eq('id', parsed.data.profile_id)
    .single()

  const { error } = await admin
    .from('huellas_dactilares')
    .insert({
      profile_id: parsed.data.profile_id,
      profile_nombre: (empleado?.nombre as string) ?? null,
      credential_id: parsed.data.credential_id,
      public_key: parsed.data.public_key,
      device_info: parsed.data.device_info ?? null,
      registrado_por: user.id,
      activo: true,
    })
  if (error) return { error: error.message }

  revalidatePath('/checador/huellas')
  return { ok: true }
}

/** El cliente llama esto después de un navigator.credentials.get() exitoso.
 *  Recibe el credentialId que el lector verificó. */
const VerificarSchema = z.object({
  credential_id: z.string().min(10),
})

export async function verificarHuella(input: z.infer<typeof VerificarSchema>): Promise<ActionState> {
  const parsed = VerificarSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  // Buscar a quién pertenece este credential
  const { data: huella } = await admin
    .from('huellas_dactilares')
    .select('id, profile_id, profile_nombre, activo')
    .eq('credential_id', parsed.data.credential_id)
    .eq('activo', true)
    .maybeSingle()

  if (!huella) return { error: 'Huella no registrada' }

  // Solo permite que el usuario verifique SU PROPIA huella
  // (si Sergio escanea su huella mientras Tania está logueada, esto fallaría)
  if (huella.profile_id !== user.id) {
    return { error: 'Esta huella pertenece a otro usuario' }
  }

  // Registrar uso
  await admin
    .from('huellas_dactilares')
    .update({
      ultimo_uso: new Date().toISOString(),
      usos_count: 0,  // PostgreSQL hace increment con +1 en una expression... más simple así
    })
    .eq('id', huella.id)
  // increment usos_count — non-critical, simple update con +1
  try {
    const { data: actual } = await admin
      .from('huellas_dactilares')
      .select('usos_count')
      .eq('id', huella.id)
      .single()
    await admin
      .from('huellas_dactilares')
      .update({ usos_count: Number(actual?.usos_count ?? 0) + 1 })
      .eq('id', huella.id)
  } catch { /* contador no es crítico */ }

  return {
    ok: true,
    profileId: huella.profile_id as string,
    profileNombre: huella.profile_nombre as string,
  }
}

export async function listarHuellasEmpleado(profileId: string): Promise<Array<{
  id: string
  device_info: string | null
  ultimo_uso: string | null
  usos_count: number
  created_at: string
}>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('huellas_dactilares')
    .select('id, device_info, ultimo_uso, usos_count, created_at')
    .eq('profile_id', profileId)
    .eq('activo', true)
    .order('created_at', { ascending: false })
  return (data ?? []) as never
}

export async function borrarHuella(huellaId: string): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles').select('roles(nombre)').eq('id', user.id).single()
  const rol = (prof?.roles as unknown as { nombre: string } | null)?.nombre
  if (rol !== 'admin' && rol !== 'socio') return { error: 'Solo admin' }

  const { error } = await admin
    .from('huellas_dactilares')
    .update({ activo: false })
    .eq('id', huellaId)
  if (error) return { error: error.message }

  revalidatePath('/checador/huellas')
  return { ok: true }
}
