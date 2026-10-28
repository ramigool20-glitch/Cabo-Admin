import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOwner } from '@/lib/auth/require-owner'

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

export async function POST(req: Request) {
  try { await requireOwner() } catch {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const { data: negocio } = await admin.from('negocios')
    .select('id').eq('nombre', 'Cvu Pharmacy local').eq('activo', true).maybeSingle()
  if (!negocio) return NextResponse.json({ error: 'No hay una farmacia local activa para este inventario.' }, { status: 409 })
  const { data, error } = await admin
    .from('inventario_productos')
    .insert({
      ...parsed.data,
      negocio_id: negocio.id,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: data?.id })
}
