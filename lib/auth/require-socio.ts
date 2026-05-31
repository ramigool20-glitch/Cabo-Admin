import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type SocioGate = { user: { id: string; email?: string }; rol: 'admin' | 'socio' }

/**
 * Verifica que la petición venga de un admin o socio (no enfermera).
 * Devuelve { user, rol } o un `NextResponse` con error 401/403.
 * Uso:
 *   const g = await requireSocio()
 *   if (g instanceof NextResponse) return g
 *   // ...usa g.user
 */
export async function requireSocio(): Promise<SocioGate | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  try {
    const admin = createAdminClient()
    const { data: prof } = await admin
      .from('profiles')
      .select('roles(nombre)')
      .eq('id', user.id)
      .single()
    const rol = (prof?.roles as unknown as { nombre: string } | null)?.nombre
    if (rol !== 'admin' && rol !== 'socio') {
      return NextResponse.json({ error: 'Solo socios/admin' }, { status: 403 })
    }
    return { user: { id: user.id, email: user.email }, rol: rol as 'admin' | 'socio' }
  } catch {
    return NextResponse.json({ error: 'Error de autorización' }, { status: 500 })
  }
}
