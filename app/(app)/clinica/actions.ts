'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ClinicaState = { ok?: boolean; error?: string }

// Determina el rol del usuario actual (admin/socio/enfermera/null)
async function getRol(): Promise<{ userId: string; rol: 'admin' | 'socio' | 'enfermera' | null } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles')
    .select('roles(nombre)')
    .eq('id', user.id)
    .single()
  const rol = (prof?.roles as unknown as { nombre: string } | null)?.nombre ?? null
  return { userId: user.id, rol: (rol === 'admin' || rol === 'socio' || rol === 'enfermera') ? rol : null }
}

// Sube una foto (si viene) y devuelve el storage path
async function subirFoto(file: File | null, userId: string): Promise<{ path?: string; error?: string }> {
  if (!file || file.size === 0) return {}
  if (file.size > 8 * 1024 * 1024) return { error: 'La foto pesa más de 8 MB' }
  if (!file.type.startsWith('image/')) return { error: 'Solo imágenes' }
  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const path = `clinica/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const buf = Buffer.from(await file.arrayBuffer())
  const admin = createAdminClient()
  const { error } = await admin.storage.from('recibos').upload(path, buf, {
    contentType: file.type,
    upsert: false,
  })
  if (error) return { error: 'Subida de foto: ' + error.message }
  return { path }
}

// ============================================================
// Registrar servicio realizado (la enfermera o socios)
// ============================================================
const RealizadoSchema = z.object({
  servicio_id: z.string().uuid().optional().nullable(),
  servicio_nombre: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ubicacion: z.string().optional().nullable(),
  pago_comision: z.coerce.number().min(0).default(0),
  propina: z.coerce.number().min(0).default(0),
  cobrado_cliente: z.coerce.number().min(0).optional().nullable(),
  notas: z.string().optional().nullable(),
})

export async function registrarServicioClinica(_prev: ClinicaState, formData: FormData): Promise<ClinicaState> {
  const ctx = await getRol()
  if (!ctx) return { error: 'No autenticado' }
  if (!ctx.rol) return { error: 'Rol no autorizado' }

  const raw = Object.fromEntries(formData.entries())
  const parsed = RealizadoSchema.safeParse({
    ...raw,
    servicio_id: raw.servicio_id || null,
    ubicacion: raw.ubicacion || null,
    cobrado_cliente: raw.cobrado_cliente || null,
    notas: raw.notas || null,
  })
  if (!parsed.success) return { error: 'Datos inválidos' }

  const esEnfermera = ctx.rol === 'enfermera'
  const fotoFile = formData.get('foto') as File | null
  if (esEnfermera && (!fotoFile || fotoFile.size === 0)) {
    return { error: 'La foto es obligatoria — manda un comprobante para que el admin apruebe' }
  }
  const up = await subirFoto(fotoFile, ctx.userId)
  if (up.error) return { error: up.error }

  const admin = createAdminClient()
  const { data: cfg } = await admin.from('clinica_config_enfermera').select('enfermera_id').eq('activa', true).maybeSingle()
  const enfermeraId = cfg?.enfermera_id ?? ctx.userId

  const { error } = await admin.from('clinica_realizados').insert({
    ...parsed.data,
    enfermera_id: enfermeraId,
    moneda: 'MXN',
    foto_url: up.path ?? null,
    estado_aprobacion: esEnfermera ? 'pendiente' : 'aprobado',
    aprobado_por: esEnfermera ? null : ctx.userId,
    aprobado_at: esEnfermera ? null : new Date().toISOString(),
  })
  if (error) {
    if (/relation.*does not exist/i.test(error.message)) return { error: 'Falta pegar migración 0025_clinica.sql' }
    if (/column .*estado_aprobacion/i.test(error.message)) return { error: 'Falta migración 0033 (estado_aprobacion)' }
    return { error: error.message }
  }

  revalidatePath('/clinica')
  return { ok: true }
}

// ============================================================
// Registrar reseña (review) — suma al bono de la enfermera
// ============================================================
const ResenaSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monto: z.coerce.number().min(0).default(50),
  cliente: z.string().optional().nullable(),
  nota: z.string().optional().nullable(),
})

export async function registrarResenaClinica(_prev: ClinicaState, formData: FormData): Promise<ClinicaState> {
  const ctx = await getRol()
  if (!ctx) return { error: 'No autenticado' }
  if (!ctx.rol) return { error: 'Rol no autorizado' }

  const raw = Object.fromEntries(formData.entries())
  const parsed = ResenaSchema.safeParse({
    ...raw,
    cliente: raw.cliente || null,
    nota: raw.nota || null,
  })
  if (!parsed.success) return { error: 'Datos inválidos' }

  const esEnfermera = ctx.rol === 'enfermera'
  const fotoFile = formData.get('foto') as File | null
  if (esEnfermera && (!fotoFile || fotoFile.size === 0)) {
    return { error: 'La foto del review es obligatoria (screenshot de Google/Yelp etc.)' }
  }
  const up = await subirFoto(fotoFile, ctx.userId)
  if (up.error) return { error: up.error }

  const admin = createAdminClient()
  const { data: cfg } = await admin.from('clinica_config_enfermera').select('enfermera_id').eq('activa', true).maybeSingle()
  const enfermeraId = cfg?.enfermera_id ?? ctx.userId

  const { error } = await admin.from('clinica_realizados').insert({
    tipo: 'review',
    servicio_nombre: '⭐ Reseña' + (parsed.data.cliente ? ` · ${parsed.data.cliente}` : ''),
    enfermera_id: enfermeraId,
    fecha: parsed.data.fecha,
    pago_comision: parsed.data.monto,
    propina: 0,
    moneda: 'MXN',
    notas: parsed.data.nota,
    foto_url: up.path ?? null,
    estado_aprobacion: esEnfermera ? 'pendiente' : 'aprobado',
    aprobado_por: esEnfermera ? null : ctx.userId,
    aprobado_at: esEnfermera ? null : new Date().toISOString(),
  })
  if (error) {
    if (/column .*tipo.* does not exist/i.test(error.message)) return { error: 'Falta la columna "tipo". Pega ALTER 0030.' }
    if (/column .*estado_aprobacion/i.test(error.message)) return { error: 'Falta migración 0033 (estado_aprobacion)' }
    return { error: error.message }
  }

  revalidatePath('/clinica')
  return { ok: true }
}

// ============================================================
// Aprobar / rechazar registro de la enfermera (solo admin/socio)
// ============================================================
export async function aprobarRealizado(id: string): Promise<ClinicaState> {
  const ctx = await getRol()
  if (!ctx) return { error: 'No autenticado' }
  if (ctx.rol !== 'admin' && ctx.rol !== 'socio') return { error: 'Solo admin/socio puede aprobar' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('clinica_realizados')
    .update({ estado_aprobacion: 'aprobado', aprobado_por: ctx.userId, aprobado_at: new Date().toISOString() })
    .eq('id', id)
    .eq('estado_aprobacion', 'pendiente')
  if (error) return { error: error.message }
  revalidatePath('/clinica')
  return { ok: true }
}

export async function rechazarRealizado(id: string, motivo: string): Promise<ClinicaState> {
  const ctx = await getRol()
  if (!ctx) return { error: 'No autenticado' }
  if (ctx.rol !== 'admin' && ctx.rol !== 'socio') return { error: 'Solo admin/socio puede rechazar' }
  if (!motivo?.trim()) return { error: 'Pon un motivo del rechazo' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('clinica_realizados')
    .update({
      estado_aprobacion: 'rechazado',
      aprobado_por: ctx.userId,
      aprobado_at: new Date().toISOString(),
      motivo_rechazo: motivo.trim(),
    })
    .eq('id', id)
    .eq('estado_aprobacion', 'pendiente')
  if (error) return { error: error.message }
  revalidatePath('/clinica')
  return { ok: true }
}

export async function eliminarServicioClinica(id: string): Promise<ClinicaState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const admin = createAdminClient()
  await admin.from('clinica_realizados').delete().eq('id', id)
  revalidatePath('/clinica')
  return { ok: true }
}

// ============================================================
// Editar precio/comisión de un servicio del catálogo
// ============================================================
export async function actualizarServicioCatalogo(id: string, formData: FormData): Promise<ClinicaState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const precio = formData.get('precio_cliente')
  const comision = formData.get('comision_enfermera')
  const moneda = formData.get('moneda_precio')

  const admin = createAdminClient()
  const { error } = await admin
    .from('clinica_servicios')
    .update({
      precio_cliente: precio ? Number(precio) : null,
      comision_enfermera: comision ? Number(comision) : null,
      moneda_precio: (moneda as string) || 'USD',
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/clinica')
  return { ok: true }
}

// ============================================================
// Config enfermera (sueldo base, bono review)
// ============================================================
export async function guardarConfigEnfermera(_prev: ClinicaState, formData: FormData): Promise<ClinicaState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const nombre = String(formData.get('nombre') || '').trim()
  const sueldo = Number(formData.get('sueldo_base_quincenal') || 0)
  const bonoReview = Number(formData.get('bono_por_review') || 50)
  const enfermeraId = String(formData.get('enfermera_id') || '').trim() || null
  if (!nombre) return { error: 'Falta nombre' }

  const admin = createAdminClient()
  const { error } = await admin.from('clinica_config_enfermera').insert({
    nombre,
    sueldo_base_quincenal: sueldo,
    bono_por_review: bonoReview,
    enfermera_id: enfermeraId,
    activa: true,
  })
  if (error) return { error: error.message }
  revalidatePath('/clinica')
  return { ok: true }
}

export async function actualizarReviews(configId: string, reviews: number): Promise<ClinicaState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }
  const admin = createAdminClient()
  await admin.from('clinica_config_enfermera').update({ reviews_acumuladas: reviews }).eq('id', configId)
  revalidatePath('/clinica')
  return { ok: true }
}
