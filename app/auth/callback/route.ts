import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isOwnerEmail } from '@/lib/auth/owner'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000' : 'https://cabo-admin.vercel.app')
  if (code) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error && isOwnerEmail(data.user?.email)) {
        return NextResponse.redirect(new URL('/auth/restablecer', base))
      }
      if (data.session) await supabase.auth.signOut()
    } catch { /* El enlace no permite continuar; nunca exponer el código. */ }
  }
  return NextResponse.redirect(new URL('/auth/restablecer?error=enlace', base))
}
