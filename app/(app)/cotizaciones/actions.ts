'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularTotales, type CotizacionItem } from '@/lib/cotizaciones/tipos'

export type ActionState = { ok?: boolean; error?: string; id?: string; folio?: string }

const ItemSchema = z.object({
  producto_id: z.string().uuid().nullable(),
  nombre: z.string().min(1).max(200),
  codigo_barras: z.string().max(60).nullable().optional(),
  cantidad: z.coerce.number().int().positive(),
  precio_unitario_mxn: z.coerce.number().min(0),
})

const CrearSchema = z.object({
  negocio_id: z.string().uuid(),
  cliente_nombre: z.string().min(1).max(200),
  cliente_email: z.string().max(200).nullable().optional(),
  cliente_telefono: z.string().max(40).nullable().optional(),
  cliente_rfc: z.string().max(20).nullable().optional(),
  cliente_direccion: z.string().max(400).nullable().optional(),
  items: z.array(ItemSchema).min(1).max(50),
  descuento_pct: z.coerce.number().min(0).max(100).optional(),
  iva_aplica: z.boolean().optional(),
  notas: z.string().max(1000).nullable().optional(),
  vigencia_dias: z.coerce.number().int().min(1).max(365).optional(),
})

const codigoNegocio = (tipo: string, nombre: string): string => {
  if (tipo === 'farmacia') return 'FAR'
  if (tipo === 'consultorio') return 'CLI'
  // Para pagina_digital, usa primeras letras del nombre
  return nombre.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'GEN'
}

export async function crearCotizacion(input: z.infer<typeof CrearSchema>): Promise<ActionState> {
  const parsed = CrearSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  // 1. Obtiene negocio para folio
  const { data: neg } = await admin
    .from('negocios')
    .select('id, nombre, tipo')
    .eq('id', parsed.data.negocio_id)
    .single()
  if (!neg) return { error: 'Negocio no existe' }

  // 2. Calcula items con subtotal
  const items: CotizacionItem[] = parsed.data.items.map(i => ({
    producto_id: i.producto_id,
    nombre: i.nombre,
    codigo_barras: i.codigo_barras ?? null,
    cantidad: i.cantidad,
    precio_unitario_mxn: i.precio_unitario_mxn,
    subtotal_mxn: i.cantidad * i.precio_unitario_mxn,
  }))

  const { subtotal, descuento, iva, total } = calcularTotales(items, {
    descuento_pct: parsed.data.descuento_pct,
    iva_aplica: parsed.data.iva_aplica,
  })

  // 3. Genera folio único
  const codigo = codigoNegocio(neg.tipo as string, neg.nombre as string)
  const year = new Date().getFullYear()
  const { count } = await admin
    .from('cotizaciones')
    .select('*', { count: 'exact', head: true })
    .like('folio', `COT-${codigo}-${year}-%`)
  const folio = `COT-${codigo}-${year}-${String((count ?? 0) + 1).padStart(4, '0')}`

  // 4. Insert
  const { data, error } = await admin
    .from('cotizaciones')
    .insert({
      folio,
      negocio_id: parsed.data.negocio_id,
      cliente_nombre: parsed.data.cliente_nombre,
      cliente_email: parsed.data.cliente_email ?? null,
      cliente_telefono: parsed.data.cliente_telefono ?? null,
      cliente_rfc: parsed.data.cliente_rfc ?? null,
      cliente_direccion: parsed.data.cliente_direccion ?? null,
      items,
      subtotal_mxn: subtotal,
      descuento_pct: parsed.data.descuento_pct ?? 0,
      descuento_mxn: descuento,
      iva_aplica: parsed.data.iva_aplica ?? false,
      iva_mxn: iva,
      total_mxn: total,
      notas: parsed.data.notas ?? null,
      vigencia_dias: parsed.data.vigencia_dias ?? 15,
      estado: 'borrador',
      created_by: user.id,
    })
    .select('id, folio')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/cotizaciones')
  return { ok: true, id: data.id as string, folio: data.folio as string }
}

const ActualizarEstadoSchema = z.object({
  id: z.string().uuid(),
  estado: z.enum(['borrador', 'enviada', 'aceptada', 'rechazada', 'expirada', 'convertida']),
})

export async function actualizarEstadoCotizacion(input: z.infer<typeof ActualizarEstadoSchema>): Promise<ActionState> {
  const parsed = ActualizarEstadoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('cotizaciones')
    .update({ estado: parsed.data.estado })
    .eq('id', parsed.data.id)
  if (error) return { error: error.message }

  revalidatePath('/cotizaciones')
  revalidatePath(`/cotizaciones/${parsed.data.id}`)
  return { ok: true }
}

export async function eliminarCotizacion(id: string): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin.from('cotizaciones').delete().eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/cotizaciones')
  redirect('/cotizaciones')
}
