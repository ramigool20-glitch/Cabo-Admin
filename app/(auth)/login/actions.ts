'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loginErrorMessage } from '@/lib/supabase/login-error'
import { createAdminClient } from '@/lib/supabase/admin'
import { isActiveOwner, isOwnerEmail } from '@/lib/auth/owner'

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')

  if (!email || !password) {
    return { error: 'Email y contraseña son requeridos.' }
  }

  if (!isOwnerEmail(email)) return { error: 'Acceso no autorizado para esta cuenta.' }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: loginErrorMessage(error) }
    if (!data.user) return { error: loginErrorMessage({}) }
    const { data: profile, error: profileError } = await createAdminClient()
      .from('profiles').select('activo').eq('id', data.user.id).single()
    if (profileError || !isActiveOwner(data.user, profile)) {
      await supabase.auth.signOut()
      return { error: 'No se pudo verificar el acceso de tu cuenta. Contacta al administrador.' }
    }
  } catch {
    return { error: loginErrorMessage({}) }
  }

  redirect('/dashboard')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
