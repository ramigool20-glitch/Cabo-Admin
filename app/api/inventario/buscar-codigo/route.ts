import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')?.trim()
  if (!code) return NextResponse.json({ producto: null })

  const admin = createAdminClient()
  const { data } = await admin
    .from('inventario_productos')
    .select('id, nombre')
    .eq('codigo_barras', code)
    .eq('activo', true)
    .maybeSingle()

  return NextResponse.json({ producto: data ?? null })
}
