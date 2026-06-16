import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

const Body = z.object({
  nombre: z.string().min(1).max(200),
  precio_mxn: z.coerce.number().min(0),
  stock: z.coerce.number().int().min(0).default(0),
  unidad_stock: z.string().max(20).optional().default('unidad'),
  categoria: z.string().max(60).nullable().optional(),
  codigo_barras: z.string().max(60).nullable().optional(),
  stock_minimo: z.coerce.number().int().min(0).default(3),
  notas: z.string().max(500).nullable().optional(),
})

// Cvu Pharmacy local
const NEGOCIO_DEFAULT_ID = '469211e8-b4bc-4bf3-9442-5c8cdf728584'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('inventario_productos')
    .insert({
      ...parsed.data,
      negocio_id: NEGOCIO_DEFAULT_ID,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: data?.id })
}
