import { NextResponse } from 'next/server'
import { requireSocio } from '@/lib/auth/require-socio'
import { createClient } from '@/lib/supabase/server'
import { buscarDuplicados } from '@/lib/duplicados'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const g = await requireSocio()
  if (g instanceof NextResponse) return g
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ duplicados: [] })

  const body = await req.json().catch(() => ({}))
  if (!body.tipo || !body.monto || !body.fecha || !body.moneda) {
    return NextResponse.json({ duplicados: [] })
  }

  const duplicados = await buscarDuplicados({
    tipo: body.tipo,
    monto: Number(body.monto),
    moneda: body.moneda,
    fecha: body.fecha,
    cuenta_id: body.cuenta_id || null,
    negocio_id: body.negocio_id || null,
    ignorarTxId: body.ignorarTxId || null,
  })

  return NextResponse.json({ duplicados })
}
