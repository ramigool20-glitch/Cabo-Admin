'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { aMxnEquivalente } from '@/lib/fx/server'
import { hoyEnCabos } from '@/lib/fechas'

// ============================================================
// VENTAS (página digital)
// ============================================================
const VentaSchema = z.object({
  negocio_id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  producto: z.string().optional().nullable(),
  precio_venta: z.coerce.number().positive(),
  moneda: z.enum(['MXN', 'USD']).default('MXN'),
  costo_producto: z.coerce.number().nonnegative().optional().nullable(),
  cuenta_id: z.string().uuid().optional().nullable(),
  notas: z.string().optional().nullable(),
})

export type VentaState = { ok?: boolean; error?: string }

export async function crearVenta(_prev: VentaState, formData: FormData): Promise<VentaState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const raw = Object.fromEntries(formData.entries())
  const parsed = VentaSchema.safeParse({
    ...raw,
    producto: raw.producto || null,
    costo_producto: raw.costo_producto || null,
    cuenta_id: raw.cuenta_id || null,
    notas: raw.notas || null,
  })
  if (!parsed.success) return { error: 'Datos inválidos' }

  // FX equivalente
  const fxPrecio = await aMxnEquivalente(parsed.data.precio_venta, parsed.data.moneda, parsed.data.fecha)
  const fxCosto = parsed.data.costo_producto
    ? await aMxnEquivalente(parsed.data.costo_producto, parsed.data.moneda, parsed.data.fecha)
    : null

  const admin = createAdminClient()
  const { error } = await admin.from('ventas').insert({
    ...parsed.data,
    precio_venta_mxn: fxPrecio.monto_mxn_equivalente,
    costo_producto_mxn: fxCosto?.monto_mxn_equivalente ?? null,
    tipo_cambio_usado: fxPrecio.tipo_cambio_usado,
    capturado_por: user.id,
  })

  if (error) {
    if (/precio_venta_mxn|monto_mxn|tipo_cambio_usado/.test(error.message)) {
      return { error: 'Falta pegar migración 0016_ventas_ads_mxn.sql en Supabase.' }
    }
    return { error: error.message }
  }

  revalidatePath(`/negocios/${parsed.data.negocio_id}`)
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function eliminarVenta(id: string, negocioId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  await admin.from('ventas').delete().eq('id', id)
  revalidatePath(`/negocios/${negocioId}`)
  return { ok: true }
}

// ============================================================
// GASTOS ADS (página digital)
// ============================================================
const AdSchema = z.object({
  negocio_id: z.string().uuid(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monto: z.coerce.number().positive(),
  moneda: z.enum(['MXN', 'USD']).default('USD'),
  plataforma: z.string().default('meta'),
  metodo_captura: z.enum(['foto', 'manual', 'api']).optional().nullable(),
  foto_url: z.string().optional().nullable(),
})

export async function crearGastoAd(_prev: VentaState, formData: FormData): Promise<VentaState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const raw = Object.fromEntries(formData.entries())
  const parsed = AdSchema.safeParse({
    ...raw,
    metodo_captura: raw.metodo_captura || 'manual',
    foto_url: raw.foto_url || null,
  })
  if (!parsed.success) return { error: 'Datos inválidos' }

  const fx = await aMxnEquivalente(parsed.data.monto, parsed.data.moneda, parsed.data.fecha)

  const admin = createAdminClient()
  const { error } = await admin.from('gastos_ads').insert({
    ...parsed.data,
    monto_mxn: fx.monto_mxn_equivalente,
    tipo_cambio_usado: fx.tipo_cambio_usado,
    capturado_por: user.id,
  })

  if (error) {
    if (/monto_mxn|tipo_cambio_usado/.test(error.message)) {
      return { error: 'Falta pegar migración 0016_ventas_ads_mxn.sql en Supabase.' }
    }
    return { error: error.message }
  }

  revalidatePath(`/negocios/${parsed.data.negocio_id}`)
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function eliminarGastoAd(id: string, negocioId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  await admin.from('gastos_ads').delete().eq('id', id)
  revalidatePath(`/negocios/${negocioId}`)
  return { ok: true }
}

// Helper para defaults
export async function getHoyDefault() {
  return hoyEnCabos()
}
