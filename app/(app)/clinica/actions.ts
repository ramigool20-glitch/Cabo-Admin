'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ClinicaState = { ok?: boolean; error?: string }

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const raw = Object.fromEntries(formData.entries())
  const parsed = RealizadoSchema.safeParse({
    ...raw,
    servicio_id: raw.servicio_id || null,
    ubicacion: raw.ubicacion || null,
    cobrado_cliente: raw.cobrado_cliente || null,
    notas: raw.notas || null,
  })
  if (!parsed.success) return { error: 'Datos inválidos' }

  const admin = createAdminClient()
  const { error } = await admin.from('clinica_realizados').insert({
    ...parsed.data,
    enfermera_id: user.id,
    moneda: 'MXN',
  })
  if (error) {
    if (/relation.*does not exist/i.test(error.message)) {
      return { error: 'Falta pegar migración 0025_clinica.sql' }
    }
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const raw = Object.fromEntries(formData.entries())
  const parsed = ResenaSchema.safeParse({
    ...raw,
    cliente: raw.cliente || null,
    nota: raw.nota || null,
  })
  if (!parsed.success) return { error: 'Datos inválidos' }

  const admin = createAdminClient()
  // Atribuir a la enfermera configurada (no a quien registra)
  const { data: cfg } = await admin
    .from('clinica_config_enfermera')
    .select('enfermera_id')
    .eq('activa', true)
    .limit(1)
    .maybeSingle()
  const enfermeraId = cfg?.enfermera_id ?? user.id

  const { error } = await admin.from('clinica_realizados').insert({
    tipo: 'review',
    servicio_nombre: '⭐ Reseña' + (parsed.data.cliente ? ` · ${parsed.data.cliente}` : ''),
    enfermera_id: enfermeraId,
    fecha: parsed.data.fecha,
    pago_comision: parsed.data.monto,
    propina: 0,
    moneda: 'MXN',
    notas: parsed.data.nota,
  })
  if (error) {
    if (/column .*tipo.* does not exist/i.test(error.message) || /tipo/i.test(error.message)) {
      return { error: 'Falta la columna "tipo". Pega el ALTER que te di en Supabase.' }
    }
    return { error: error.message }
  }

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
