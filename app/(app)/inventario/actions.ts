'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ActionState = { ok?: boolean; error?: string; foto_url?: string | null }

/**
 * Ajusta el stock de un producto. Crea un registro en inventario_movimientos
 * para auditoría.
 *   tipo = 'entrada' (+), 'salida' (-), 'ajuste' (set absoluto)
 */
const AjustarStockSchema = z.object({
  producto_id: z.string().uuid(),
  cantidad: z.coerce.number().int(),       // positiva = entrada, negativa = salida
  tipo: z.enum(['entrada', 'salida', 'ajuste']),
  motivo: z.string().max(200).optional().nullable(),
})

export async function ajustarStock(input: z.infer<typeof AjustarStockSchema>): Promise<ActionState> {
  const parsed = AjustarStockSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { data: prod } = await admin
    .from('inventario_productos')
    .select('stock, precio_mxn')
    .eq('id', parsed.data.producto_id)
    .single()
  if (!prod) return { error: 'Producto no existe' }

  const stockActual = Number(prod.stock ?? 0)
  let nuevoStock: number
  let cantidadMov: number   // lo que va a inventario_movimientos
  if (parsed.data.tipo === 'ajuste') {
    nuevoStock = parsed.data.cantidad
    cantidadMov = nuevoStock - stockActual
  } else if (parsed.data.tipo === 'entrada') {
    nuevoStock = stockActual + Math.abs(parsed.data.cantidad)
    cantidadMov = Math.abs(parsed.data.cantidad)
  } else {
    nuevoStock = stockActual - Math.abs(parsed.data.cantidad)
    cantidadMov = -Math.abs(parsed.data.cantidad)
  }
  if (nuevoStock < 0) nuevoStock = 0

  const { error: upErr } = await admin
    .from('inventario_productos')
    .update({ stock: nuevoStock })
    .eq('id', parsed.data.producto_id)
  if (upErr) return { error: upErr.message }

  // Registrar movimiento (best-effort)
  await admin.from('inventario_movimientos').insert({
    producto_id: parsed.data.producto_id,
    tipo: parsed.data.tipo,
    cantidad: cantidadMov,
    precio_unitario: prod.precio_mxn,
    motivo: parsed.data.motivo ?? null,
    creado_por: user.id,
  })

  revalidatePath('/inventario')
  return { ok: true }
}

/** Update de campos editables del producto (nombre, precio, categoría, etc.) */
const ActualizarProductoSchema = z.object({
  producto_id: z.string().uuid(),
  nombre: z.string().min(1).max(200).optional(),
  precio_mxn: z.coerce.number().min(0).optional(),
  categoria: z.string().max(60).nullable().optional(),
  codigo_barras: z.string().max(60).nullable().optional(),
  unidad_stock: z.string().max(20).optional(),
  stock_minimo: z.coerce.number().int().min(0).optional(),
  notas: z.string().max(500).nullable().optional(),
})

export async function actualizarProducto(input: z.infer<typeof ActualizarProductoSchema>): Promise<ActionState> {
  const parsed = ActualizarProductoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { producto_id, ...campos } = parsed.data
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(campos)) {
    if (v !== undefined) update[k] = v
  }
  if (Object.keys(update).length === 0) return { ok: true }

  const { error } = await admin
    .from('inventario_productos')
    .update(update)
    .eq('id', producto_id)
  if (error) return { error: error.message }

  revalidatePath('/inventario')
  return { ok: true }
}

/** Eliminar producto (soft delete: activo=false). Mantiene movimientos. */
export async function eliminarProducto(producto_id: string): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('inventario_productos')
    .update({ activo: false })
    .eq('id', producto_id)
  if (error) return { error: error.message }

  revalidatePath('/inventario')
  return { ok: true }
}

/** Sube foto al bucket 'productos' y guarda el path en foto_url. */
export async function subirFotoProducto(formData: FormData): Promise<ActionState> {
  const producto_id = formData.get('producto_id') as string | null
  const file = formData.get('foto') as File | null
  if (!producto_id || !file) return { error: 'Falta producto_id o archivo' }
  if (file.size === 0) return { error: 'Archivo vacío' }
  if (file.size > 5 * 1024 * 1024) return { error: 'Foto pesa más de 5 MB' }
  if (!file.type.startsWith('image/')) return { error: 'Solo imágenes' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const path = `${producto_id}/${Date.now()}.${ext}`
  const buf = Buffer.from(await file.arrayBuffer())

  const admin = createAdminClient()

  // Borrar foto anterior si la había
  const { data: prev } = await admin
    .from('inventario_productos')
    .select('foto_url')
    .eq('id', producto_id)
    .single()
  if (prev?.foto_url) {
    admin.storage.from('productos').remove([prev.foto_url]).catch(() => {})
  }

  const { error: upErr } = await admin.storage.from('productos').upload(path, buf, {
    contentType: file.type,
    upsert: false,
  })
  if (upErr) return { error: 'Upload: ' + upErr.message }

  const { error: dbErr } = await admin
    .from('inventario_productos')
    .update({ foto_url: path })
    .eq('id', producto_id)
  if (dbErr) return { error: dbErr.message }

  // Devolvemos signed URL fresca
  const { data: signed } = await admin.storage
    .from('productos')
    .createSignedUrl(path, 60 * 60 * 8)

  revalidatePath('/inventario')
  return { ok: true, foto_url: signed?.signedUrl ?? null }
}

/** Quita la foto del producto */
export async function quitarFotoProducto(producto_id: string): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { data: prev } = await admin
    .from('inventario_productos')
    .select('foto_url')
    .eq('id', producto_id)
    .single()

  if (prev?.foto_url) {
    admin.storage.from('productos').remove([prev.foto_url]).catch(() => {})
  }
  await admin
    .from('inventario_productos')
    .update({ foto_url: null })
    .eq('id', producto_id)

  revalidatePath('/inventario')
  return { ok: true }
}
