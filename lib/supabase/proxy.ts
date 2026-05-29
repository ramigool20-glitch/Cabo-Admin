import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from './admin'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANTE: getUser() refresca la sesión y debe llamarse aquí.
  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isPublic =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    // Crons (Bearer CRON_SECRET) y webhooks (firma) se autentican solos,
    // no traen cookie de sesión. NO redirigir a /login o nunca se ejecutan.
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/webhooks') ||
    pathname === '/api/stripe/webhook'

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Gating de rol del lado del SERVIDOR: la enfermera solo puede entrar a
  // /clinica y /tareas. Cualquier otra página la regresa a /clinica antes de
  // que el servidor renderice o consulte datos financieros.
  if (
    user &&
    !isPublic &&
    !pathname.startsWith('/api') &&
    !pathname.startsWith('/clinica') &&
    !pathname.startsWith('/tareas')
  ) {
    try {
      const admin = createAdminClient()
      const { data: prof } = await admin.from('profiles').select('roles(nombre)').eq('id', user.id).single()
      const rol = (prof?.roles as unknown as { nombre: string } | null)?.nombre
      if (rol === 'enfermera') {
        const url = request.nextUrl.clone()
        url.pathname = '/clinica'
        return NextResponse.redirect(url)
      }
    } catch {
      // si falla la verificación de rol, no bloqueamos (la guard de cliente respalda)
    }
  }

  return supabaseResponse
}
