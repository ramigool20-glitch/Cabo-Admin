import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from './admin'
import { isActiveOwner } from '@/lib/auth/owner'

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
    pathname === '/recuperar' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    // Crons (Bearer CRON_SECRET) y webhooks (firma) se autentican solos,
    // no traen cookie de sesión. NO redirigir a /login o nunca se ejecutan.
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/webhooks') ||
    pathname === '/api/stripe/webhook' ||
    // Routine remoto (Bearer CRON_SECRET) deposita reportes SEO
    pathname === '/api/seo-reports'


  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Los endpoints públicos verifican sus propios secretos o firmas.
  // Todo acceso privado, incluidas APIs, exige al propietario activo.
  if (user && (!isPublic || pathname === '/login')) {
    try {
      const { data: profile, error } = await createAdminClient()
        .from('profiles').select('activo').eq('id', user.id).single()
      const allowed = !error && isActiveOwner(user, profile)
      if (!allowed && !isPublic) {
        return NextResponse.json({ error: 'Acceso no autorizado' }, { status: 403 })
      }
      if (allowed && pathname === '/login') {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        const response = NextResponse.redirect(url)
        for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie)
        return response
      }
    } catch {
      if (!isPublic) return NextResponse.json({ error: 'Servicio de acceso no disponible' }, { status: 503 })
    }
  }

  return supabaseResponse
}
