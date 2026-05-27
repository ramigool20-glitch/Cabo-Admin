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

  const fxPrecio = await aMxnEquivalente(parsed.data.precio_venta, parsed.data.moneda, parsed.data.fecha)
  const fxCosto = parsed.data.costo_producto
    ? await aMxnEquivalente(parsed.data.costo_producto, parsed.data.moneda, parsed.data.fecha)
    : null

  const admin = createAdminClient()

  // 1) Inserta venta especializada
  const { data: venta, error } = await admin
    .from('ventas')
    .insert({
      ...parsed.data,
      precio_venta_mxn: fxPrecio.monto_mxn_equivalente,
      costo_producto_mxn: fxCosto?.monto_mxn_equivalente ?? null,
      tipo_cambio_usado: fxPrecio.tipo_cambio_usado,
      capturado_por: user.id,
    })
    .select('id')
    .single()

  if (error) {
    if (/precio_venta_mxn|monto_mxn|tipo_cambio_usado/.test(error.message)) {
      return { error: 'Falta pegar migración 0016_ventas_ads_mxn.sql en Supabase.' }
    }
    return { error: error.message }
  }

  // 2) Inserta transacción de INGRESO ligada (aparece en dashboard, totales)
  await admin.from('transacciones').insert({
    tipo: 'ingreso',
    fecha: parsed.data.fecha,
    monto: parsed.data.precio_venta,
    moneda: parsed.data.moneda,
    monto_mxn_equivalente: fxPrecio.monto_mxn_equivalente,
    tipo_cambio_usado: fxPrecio.tipo_cambio_usado,
    negocio_id: parsed.data.negocio_id,
    categoria: 'ventas',
    concepto: parsed.data.producto || 'Venta',
    metodo_pago: 'otro',
    metodo_captura: 'api',
    capturado_por: user.id,
    notas: `Sincronizado desde ventas (id: ${venta?.id ?? '?'})`,
  })

  // 3) Si tiene costo_producto, también lo agregamos como GASTO ligado
  if (parsed.data.costo_producto && parsed.data.costo_producto > 0 && fxCosto) {
    await admin.from('transacciones').insert({
      tipo: 'gasto',
      fecha: parsed.data.fecha,
      monto: parsed.data.costo_producto,
      moneda: parsed.data.moneda,
      monto_mxn_equivalente: fxCosto.monto_mxn_equivalente,
      tipo_cambio_usado: fxCosto.tipo_cambio_usado,
      negocio_id: parsed.data.negocio_id,
      categoria: 'costo-producto',
      concepto: `Costo: ${parsed.data.producto || 'producto'}`,
      metodo_pago: 'sistema',
      capturado_por: user.id,
      notas: `Sincronizado desde ventas (id: ${venta?.id ?? '?'}) costo`,
    })
  }

  revalidatePath(`/negocios/${parsed.data.negocio_id}`)
  revalidatePath(`/negocios/${parsed.data.negocio_id}/ventas`)
  revalidatePath('/dashboard')
  revalidatePath('/transacciones')
  return { ok: true }
}

export async function eliminarVenta(id: string, negocioId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  // Borra las transacciones ligadas (ingreso + costo si había)
  await admin
    .from('transacciones')
    .delete()
    .eq('negocio_id', negocioId)
    .like('notas', `%ventas (id: ${id})%`)

  await admin.from('ventas').delete().eq('id', id)
  revalidatePath(`/negocios/${negocioId}`)
  revalidatePath(`/negocios/${negocioId}/ventas`)
  revalidatePath('/dashboard')
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

const PLATAFORMA_LABEL: Record<string, string> = {
  meta: 'Meta Ads (FB/IG)',
  google: 'Google Ads',
  tiktok: 'TikTok Ads',
  otro: 'Otros Ads',
}

const PLATAFORMA_CATEGORIA: Record<string, string> = {
  meta: 'ads-meta',
  google: 'ads-google',
  tiktok: 'ads-tiktok',
  otro: 'ads-otros',
}

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

  // 1) Insertar el gasto_ads (especializado para métricas/ROAS)
  const { data: gastoAd, error: errAd } = await admin
    .from('gastos_ads')
    .insert({
      ...parsed.data,
      monto_mxn: fx.monto_mxn_equivalente,
      tipo_cambio_usado: fx.tipo_cambio_usado,
      capturado_por: user.id,
    })
    .select('id')
    .single()

  if (errAd) {
    if (/monto_mxn|tipo_cambio_usado/.test(errAd.message)) {
      return { error: 'Falta pegar migración 0016_ventas_ads_mxn.sql en Supabase.' }
    }
    return { error: errAd.message }
  }

  // 2) Crear también la transacción ligada — así el gasto aparece en
  //    dashboard, totales del negocio, categorías, etc.
  const plat = parsed.data.plataforma || 'otro'
  const platLabel = PLATAFORMA_LABEL[plat] ?? PLATAFORMA_LABEL.otro
  const categoria = PLATAFORMA_CATEGORIA[plat] ?? 'ads-otros'

  await admin.from('transacciones').insert({
    tipo: 'gasto',
    fecha: parsed.data.fecha,
    monto: parsed.data.monto,
    moneda: parsed.data.moneda,
    monto_mxn_equivalente: fx.monto_mxn_equivalente,
    tipo_cambio_usado: fx.tipo_cambio_usado,
    negocio_id: parsed.data.negocio_id,
    categoria,
    concepto: platLabel,
    metodo_pago: 'otro',
    metodo_captura: 'api',
    capturado_por: user.id,
    notas: `Sincronizado desde gastos_ads (id: ${gastoAd?.id ?? '?'})`,
  })

  revalidatePath(`/negocios/${parsed.data.negocio_id}`)
  revalidatePath(`/negocios/${parsed.data.negocio_id}/ads`)
  revalidatePath('/dashboard')
  revalidatePath('/transacciones')
  return { ok: true }
}

export async function eliminarGastoAd(id: string, negocioId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()

  // Borrar también la transacción asociada (si existe la nota con el id)
  await admin
    .from('transacciones')
    .delete()
    .eq('negocio_id', negocioId)
    .like('notas', `%gastos_ads (id: ${id})%`)

  await admin.from('gastos_ads').delete().eq('id', id)
  revalidatePath(`/negocios/${negocioId}`)
  revalidatePath(`/negocios/${negocioId}/ads`)
  revalidatePath('/dashboard')
  return { ok: true }
}

// Helper para defaults
export async function getHoyDefault() {
  return hoyEnCabos()
}
