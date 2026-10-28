'use server'


import { requireOwner } from '@/lib/auth/require-owner'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'
import { aMxnEquivalente } from '@/lib/fx/server'
import { puedeHacerCorte } from '@/app/(app)/checador/actions'

export type ActionState = { ok?: boolean; error?: string; id?: string }

const CorteSchema = z.object({
  clave_idempotencia: z.string().min(8).max(150),
  contado_efectivo_usd: z.coerce.number().min(0).default(0),
  contado_transfer_mxn: z.coerce.number().min(0).optional(),
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
  await requireOwner()
  const parsed = CorteSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const acceso = await puedeHacerCorte()
  if (!acceso.permitido) return { error: acceso.mensaje ?? 'Corte no disponible' }
  const d = parsed.data
  if (d.fecha !== hoyEnCabos()) return { error: 'El corte debe corresponder al día actual de Los Cabos.' }
  const fx = await aMxnEquivalente(1, 'USD', d.fecha)
  const { data, error } = await createAdminClient().rpc('cerrar_caja_atomica', { p: {
    usuario_id: user.id, negocio_id: d.negocio_id, fecha: d.fecha,
    clave_idempotencia: d.clave_idempotencia, tasa: fx.tipo_cambio_usado,
    contado_efectivo_mxn: d.contado_efectivo_mxn, contado_efectivo_usd: d.contado_efectivo_usd,
    contado_mp_mxn: d.contado_mp_mxn, contado_tarjeta_mxn: d.contado_tarjeta_mxn,
    contado_transfer_mxn: d.contado_transfer_mxn, notas: d.notas,
  } })
  if (error || !data) return { error: error?.message ?? 'No se pudo cerrar la caja' }
  revalidatePath('/pos')
  revalidatePath('/pos/corte')
  redirect(`/pos/corte/${data}`)
}
