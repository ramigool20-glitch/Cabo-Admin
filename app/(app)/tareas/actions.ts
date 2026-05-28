'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { flashOk } from '@/lib/flash'
import { enviarPushAProfiles } from '@/lib/push/server'

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

  const { data: tareaCreada, error } = await supabase.from('tareas').insert({
    ...parsed.data,
    creada_por: user.id,
    estado: 'pendiente',
  }).select('id, titulo, prioridad, fecha_limite, asignada_a').single()

  if (error) return { error: error.message }

  // Push a TODOS los socios + asignados (sin duplicar y sin notificar al creador)
  try {
    const admin = createAdminClient()
    const [{ data: roles }, { data: perfilesActivos }] = await Promise.all([
      admin.from('roles').select('id, nombre'),
      admin.from('profiles').select('id, nombre, role_id').eq('activo', true),
    ])
    const rolesById = new Map((roles ?? []).map((r) => [r.id, r.nombre]))

    const idsSocios = (perfilesActivos ?? [])
      .filter((p) => ['admin', 'socio'].includes(rolesById.get(p.role_id ?? '') ?? ''))
      .map((p) => p.id)

    const asignados = (parsed.data.asignada_a ?? []) as string[]
    const destinatarios = Array.from(new Set([...idsSocios, ...asignados]))
      .filter((id) => id !== user.id)

    if (destinatarios.length > 0 && tareaCreada) {
      const creadorNombre = (perfilesActivos ?? []).find((p) => p.id === user.id)?.nombre ?? 'Alguien'
      const prioridadEmoji = parsed.data.prioridad === 'alta' ? '🔥' : parsed.data.prioridad === 'media' ? '⚡' : '📝'
      const venceTxt = parsed.data.fecha_limite
        ? ` · vence ${parsed.data.fecha_limite.slice(0, 10)}`
        : ''

      await enviarPushAProfiles(destinatarios, {
        title: `${prioridadEmoji} Nueva tarea de ${creadorNombre}`,
        body: `${parsed.data.titulo}${venceTxt}`,
        url: '/tareas',
        tag: `tarea-${tareaCreada.id}`,
        data: { prioridad: parsed.data.prioridad },
      })
    }
  } catch {
    // No bloqueamos la creación de la tarea por errores de push
  }

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
