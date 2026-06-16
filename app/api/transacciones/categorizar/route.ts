/**
 * POST /api/transacciones/categorizar
 * Endpoint para responder de "1 tap" desde el push de cobros MP.
 * Body: { tx_id: string, negocio_id: string, categoria?: string | null }
 * Acciones:
 *   - Update transacciones SET negocio_id, categoria
 *   - Cierra el auditor_pendiente asociado (busca por contexto que contiene tx_id)
 *   - Registra historial
 */
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarHistorial } from '@/lib/historial'

const Body = z.object({
  tx_id: z.string().uuid(),
  negocio_id: z.string().uuid(),
  categoria: z.string().max(60).nullable().optional(),
})

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = Body.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detail: parsed.error.flatten() }, { status: 400 })
  }

  const { tx_id, negocio_id, categoria } = parsed.data
  const admin = createAdminClient()

  // Snapshot previo para historial
  const { data: antes } = await admin
    .from('transacciones')
    .select('tipo, monto, moneda, fecha, concepto, categoria, metodo_pago, notas, negocio_id, cuenta_id, atribuido_a, monto_mxn_equivalente, tipo_cambio_usado')
    .eq('id', tx_id)
    .maybeSingle()

  if (!antes) return NextResponse.json({ error: 'Transacción no existe' }, { status: 404 })

  // Update
  const updateData = {
    negocio_id,
    categoria: categoria ?? antes.categoria ?? 'ventas',
  }
  const { error } = await admin
    .from('transacciones')
    .update(updateData)
    .eq('id', tx_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Historial
  await registrarHistorial(tx_id, 'editada', user.id, antes, { ...antes, ...updateData })

  // Cierra todas las auditor_pendientes "abiertas" que mencionen este tx_id en su contexto
  await admin
    .from('auditor_pendientes')
    .update({
      estado: 'contestada',
      respuesta: `Categorizada: negocio=${negocio_id}${categoria ? `, categoría=${categoria}` : ''}`,
      contestada_at: new Date().toISOString(),
    })
    .like('contexto', `%"tx_id":"${tx_id}"%`)
    .eq('estado', 'abierta')

  return NextResponse.json({ ok: true })
}
