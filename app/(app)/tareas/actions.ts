'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { flashOk } from '@/lib/flash'

const TareaSchema = z.object({
  titulo: z.string().min(1).max(200),
  descripcion: z.string().max(1000).optional().nullable(),
  asignada_a: z.array(z.string().uuid()).min(1, 'Asigna a al menos una persona'),
  fecha_limite: z.string(), // ISO string
  prioridad: z.enum(['alta', 'media', 'baja']),
  negocio_id: z.string().uuid().optional().nullable(),
  categoria: z.enum(['operativa', 'administrativa', 'pago', 'corte', 'auditoria', 'otra']).optional().nullable(),
  multa_monto: z.coerce.number().nonnegative().optional().nullable(),
  moneda_multa: z.enum(['MXN', 'USD']).default('MXN'),
  recurrente: z.coerce.boolean().default(false),
  frecuencia_recurrente: z.enum(['diaria', 'semanal', 'quincenal', 'mensual']).optional().nullable(),
})

export type ActionState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]> }

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries())
  const asignada_a = formData.getAll('asignada_a').map(String).filter(Boolean)
  return TareaSchema.safeParse({
    titulo: raw.titulo,
    descripcion: raw.descripcion || null,
    asignada_a,
    fecha_limite: raw.fecha_limite,
    prioridad: raw.prioridad,
    negocio_id: raw.negocio_id || null,
    categoria: raw.categoria || null,
    multa_monto: raw.multa_monto || null,
    moneda_multa: raw.moneda_multa || 'MXN',
    recurrente: raw.recurrente === 'on' || raw.recurrente === 'true',
    frecuencia_recurrente: raw.frecuencia_recurrente || null,
  })
}

export async function createTarea(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parse(formData)
  if (!parsed.success) {
    return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase.from('tareas').insert({
    ...parsed.data,
    creada_por: user.id,
    estado: 'pendiente',
  })
  if (error) return { error: error.message }

  revalidatePath('/tareas')
  revalidatePath('/dashboard')
  flashOk('/tareas', 'tarea_creada')
}

export async function completarTarea(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('tareas')
    .update({
      estado: 'completada',
      completada_at: new Date().toISOString(),
      completada_por: user.id,
    })
    .eq('id', id)

  revalidatePath('/tareas')
  revalidatePath('/dashboard')
}

export async function reabrirTarea(id: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('tareas')
    .update({ estado: 'pendiente', completada_at: null, completada_por: null })
    .eq('id', id)
  revalidatePath('/tareas')
}

export async function eliminarTarea(id: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('tareas').delete().eq('id', id)
  revalidatePath('/tareas')
  flashOk('/tareas', 'tarea_eliminada')
}
