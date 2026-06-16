/**
 * POST /api/integraciones/mp/refresh-saldo
 * Body: { integ_id: string }
 * Refresca el saldo de una integración MP bajo demanda (botón en /config).
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { refrescarSaldoIntegracion } from '@/lib/integraciones/mercadopago'

const Body = z.object({ integ_id: z.string().uuid() })

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = Body.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const r = await refrescarSaldoIntegracion(parsed.data.integ_id)
  if (!r.ok) return NextResponse.json({ error: r.error ?? 'Error' }, { status: 502 })

  return NextResponse.json({ ok: true })
}
