import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sugerirCategorizacion } from '@/lib/ai/sugerir-categorizacion'

export const runtime = 'nodejs'
export const maxDuration = 15

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: { concepto?: string; tipo?: string; monto?: number } = {}
  try { body = await req.json() } catch { /* ignore */ }
  if (!body.concepto || (body.tipo !== 'gasto' && body.tipo !== 'ingreso')) {
    return NextResponse.json({ sugerencia: null })
  }

  const admin = createAdminClient()
  const sugerencia = await sugerirCategorizacion(admin, {
    concepto: body.concepto,
    tipo: body.tipo,
    monto: body.monto,
  })
  return NextResponse.json({ sugerencia })
}
