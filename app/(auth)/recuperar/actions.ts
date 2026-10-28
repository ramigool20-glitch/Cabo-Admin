'use server'

import { createClient } from '@/lib/supabase/server'
import { isOwnerEmail } from '@/lib/auth/owner'
import { loginErrorMessage } from '@/lib/supabase/login-error'

export async function solicitarRecuperacion(_previous: { error?: string; ok?: boolean }, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (!isOwnerEmail(email)) return { ok: true }
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000' : 'https://cabo-admin.vercel.app')
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL('/auth/callback', base).toString(),
    })
    if (error) return { error: loginErrorMessage(error) }
    return { ok: true }
  } catch {
    return { error: loginErrorMessage({}) }
  }
}
