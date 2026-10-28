'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isOwnerEmail } from '@/lib/auth/owner'
import { loginErrorMessage } from '@/lib/supabase/login-error'

export async function restablecerPassword(_previous: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const password = String(form.get('password') ?? '')
  if (password.length < 12 || password.length > 128) return { error: 'Usa entre 12 y 128 caracteres.' }
  if (password !== form.get('confirmacion')) return { error: 'Las contraseñas no coinciden.' }
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user || !isOwnerEmail(user.email)) return { error: 'Solicita un nuevo enlace de recuperación.' }
    const result = await supabase.auth.updateUser({ password })
    if (result.error) return { error: 'No se pudo cambiar la contraseña. Revisa el enlace y la política de contraseñas.' }
    const signedOut = await supabase.auth.signOut({ scope: 'global' })
    if (signedOut.error) return { error: 'Contraseña actualizada. No se pudieron cerrar las sesiones anteriores; vuelve a iniciar sesión y revisa la seguridad de la cuenta.' }
  } catch {
    return { error: loginErrorMessage({}) }
  }
  redirect('/login?recuperada=1')
}
