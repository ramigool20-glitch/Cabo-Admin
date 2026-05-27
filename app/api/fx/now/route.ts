import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRateHoy } from '@/lib/fx/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const rate = await getRateHoy()
  if (!rate) {
    return NextResponse.json({ ok: false, error: 'Sin rate disponible' }, { status: 503 })
  }

  // Variación vs el día anterior
  const admin = createAdminClient()
  const { data: anterior } = await admin
    .from('fx_rates')
    .select('rate_compra')
    .lt('fecha', rate.fecha)
    .order('fecha', { ascending: false })
    .limit(1)
    .single()

  const variacion = anterior
    ? Number(rate.rate_compra) - Number(anterior.rate_compra)
    : null

  return NextResponse.json({ ok: true, rate, variacion })
}
