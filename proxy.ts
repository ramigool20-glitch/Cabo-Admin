import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Excluye assets estáticos, PWA, service worker y media.
     */
    '/((?!_next/static|_next/image|favicon.ico|icons|media|manifest.json|sw.js|workbox-.*\\.js|p/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|mov|woff2?)$).*)',
  ],
}
