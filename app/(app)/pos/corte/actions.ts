'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ActionState = { ok?: boolean; error?: string; id?: string }

const CorteSchema = z.object({
  negocio_id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Calculados (los manda el cliente para verificación)
  esperado_efectivo_mxn: z.coerce.number().min(0),
  esperado_mp_mxn: z.coerce.number().min(0),
  esperado_tarjeta_mxn: z.coerce.number().min(0),
  esperado_transfer_mxn: z.coerce.number().min(0).default(0),
  esperado_total_mxn: z.coerce.number().min(0),
  ventas_count: z.coerce.number().int().min(0),
  unidades_vendidas: z.coerce.number().int().min(0),
  ganancia_estimada_mxn: z.coerce.number().default(0),
  // Contado (lo que la cajera reporta)
  contado_efectivo_mxn: z.coerce.number().min(0),
  contado_mp_mxn: z.coerce.number().min(0).optional(),
  contado_tarjeta_mxn: z.coerce.number().min(0).optional(),
  notas: z.string().max(1000).optional().nullable(),
})

export async function crearCorteCaja(input: z.infer<typeof CorteSchema>): Promise<ActionState> {
  const parsed = CorteSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles')
    .select('nombre')
    .eq('id', user.id)
    .single()

  const d = parsed.data
  const difEfectivo = d.esperado_efectivo_mxn - d.contado_efectivo_mxn
  const totalContado = d.contado_efectivo_mxn + (d.contado_mp_mxn ?? d.esperado_mp_mxn) + (d.contado_tarjeta_mxn ?? d.esperado_tarjeta_mxn)
  const difTotal = d.esperado_total_mxn - totalContado

  const { data, error } = await admin
    .from('cortes_caja')
    .insert({
      negocio_id: d.negocio_id,
      cajera_id: user.id,
      cajera_nombre: prof?.nombre ?? null,
      fecha: d.fecha,
      cierre_at: new Date().toISOString(),
      esperado_efectivo_mxn: d.esperado_efectivo_mxn,
      esperado_mp_mxn: d.esperado_mp_mxn,
      esperado_tarjeta_mxn: d.esperado_tarjeta_mxn,
      esperado_transfer_mxn: d.esperado_transfer_mxn,
      esperado_total_mxn: d.esperado_total_mxn,
      contado_efectivo_mxn: d.contado_efectivo_mxn,
      contado_mp_mxn: d.contado_mp_mxn ?? d.esperado_mp_mxn,
      contado_tarjeta_mxn: d.contado_tarjeta_mxn ?? d.esperado_tarjeta_mxn,
      diferencia_efectivo_mxn: difEfectivo,
      diferencia_total_mxn: difTotal,
      ventas_count: d.ventas_count,
      unidades_vendidas: d.unidades_vendidas,
      ganancia_estimada_mxn: d.ganancia_estimada_mxn,
      notas: d.notas ?? null,
      estado: 'cerrado',
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/pos')
  revalidatePath('/pos/corte')
  redirect(`/pos/corte/${data.id}`)
}
