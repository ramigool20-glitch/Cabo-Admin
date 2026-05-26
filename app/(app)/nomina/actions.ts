'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { proximaFechaPagoEmpleado } from '@/lib/proximo-pago'
import { hoyEnCabos } from '@/lib/fechas'
import { flashOk } from '@/lib/flash'

const EmpleadoSchema = z.object({
  nombre: z.string().min(1).max(120),
  puesto: z.string().max(120).optional().nullable(),
  fecha_ingreso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notas: z.string().max(500).optional().nullable(),
})

const CompensacionSchema = z.object({
  empleado_id: z.string().uuid(),
  negocio_id: z.string().uuid(),
  sueldo_base: z.coerce.number().nonnegative(),
  moneda: z.enum(['MXN', 'USD']).default('MXN'),
  comision_porcentaje: z.coerce.number().min(0).max(100).default(0),
  comision_base: z.enum(['venta_total', 'utilidad', 'producto_especifico', 'fijo']).optional().nullable(),
  monto_fijo_comision: z.coerce.number().optional().nullable(),
  frecuencia_pago: z.enum(['mensual', 'quincenal', 'semanal']),
  dia_de_pago: z.coerce.number().int().min(1).max(31).optional().nullable(),
})

const PagoNominaSchema = z.object({
  empleado_id: z.string().uuid(),
  negocio_id: z.string().uuid(),
  fecha_pago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodo_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  periodo_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  sueldo_base_pagado: z.coerce.number().nonnegative(),
  comision_pagada: z.coerce.number().nonnegative(),
  ventas_periodo: z.coerce.number().optional().nullable(),
  total: z.coerce.number().positive(),
  moneda: z.enum(['MXN', 'USD']).default('MXN'),
  cuenta_id: z.string().uuid().optional().nullable(),
  notas: z.string().optional().nullable(),
})

export type ActionState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string[]> }

function parseEmpleado(formData: FormData) {
  const raw = Object.fromEntries(formData.entries())
  return EmpleadoSchema.safeParse({
    nombre: raw.nombre,
    puesto: raw.puesto || null,
    fecha_ingreso: raw.fecha_ingreso || null,
    notas: raw.notas || null,
  })
}

export async function createEmpleado(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseEmpleado(formData)
  if (!parsed.success) {
    return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('empleados')
    .insert({ ...parsed.data, activo: true })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/nomina')
  flashOk(`/nomina/${data.id}`, 'empleado_creado')
}

export async function updateEmpleado(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseEmpleado(formData)
  if (!parsed.success) return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }
  const supabase = await createClient()
  const { error } = await supabase.from('empleados').update(parsed.data).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/nomina')
  revalidatePath(`/nomina/${id}`)
  redirect(`/nomina/${id}`)
}

export async function deleteEmpleado(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('empleados').update({ activo: false }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/nomina')
  redirect('/nomina')
}

export async function addCompensacion(empleadoId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(formData.entries())
  const parsed = CompensacionSchema.safeParse({ ...raw, empleado_id: empleadoId })
  if (!parsed.success) return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }

  const supabase = await createClient()
  const { data: compInsertada, error } = await supabase
    .from('empleado_compensacion')
    .insert({ ...parsed.data, activo: true })
    .select('id, frecuencia_pago, dia_de_pago, sueldo_base, moneda, negocio_id')
    .single()
  if (error) return { error: error.message }

  // Programar push de aviso 1 día antes del próximo pago (si es hoy o mañana, lo agenda inmediato).
  try {
    const admin = createAdminClient()
    const { data: socios } = await admin
      .from('profiles')
      .select('id, role_id, roles(nombre)')
      .eq('activo', true)
    const destinatarios = (socios ?? [])
      .filter((p) => {
        const r = p.roles as unknown as { nombre: string } | null
        return r?.nombre === 'admin' || r?.nombre === 'socio'
      })
      .map((p) => p.id)

    if (destinatarios.length > 0 && compInsertada) {
      const { data: emp } = await admin.from('empleados').select('nombre').eq('id', empleadoId).single()
      const proximaPago = proximaFechaPagoEmpleado(
        compInsertada.frecuencia_pago as 'mensual' | 'quincenal' | 'semanal',
        compInsertada.dia_de_pago ? Number(compInsertada.dia_de_pago) : null
      )
      const hoy = hoyEnCabos()
      const proxima = new Date(proximaPago + 'T12:00:00Z')
      const ahora = new Date()
      const dias = Math.ceil((proxima.getTime() - ahora.getTime()) / (1000 * 60 * 60 * 24))

      // Si el próximo pago es en los próximos 7 días, programa el aviso 1 día antes
      if (dias >= 0 && dias <= 7) {
        const disparo = new Date(proxima.getTime() - 24 * 60 * 60 * 1000)
        // Si "1 día antes" ya pasó, lo manda en 1 hora
        const final = disparo < ahora ? new Date(ahora.getTime() + 60 * 60 * 1000) : disparo

        await admin.from('notificaciones_programadas').insert({
          tipo: 'nomina',
          titulo: `💵 Mañana toca pagar: ${emp?.nombre ?? 'empleado'}`,
          mensaje: `${compInsertada.moneda} ${Number(compInsertada.sueldo_base).toLocaleString()} · ${compInsertada.frecuencia_pago} · día ${compInsertada.dia_de_pago ?? '?'} (próximo pago ${proximaPago})`,
          fecha_disparo: final.toISOString(),
          destinatarios,
          ref_tabla: 'empleado_compensacion',
          ref_id: compInsertada.id,
          enviada: false,
        })
      }
    }
  } catch {
    // No fallar la creación si el push agendamiento truena
  }

  revalidatePath(`/nomina/${empleadoId}`)
  flashOk(`/nomina/${empleadoId}`, 'compensacion')
}

export async function deleteCompensacion(id: string, empleadoId: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('empleado_compensacion').update({ activo: false }).eq('id', id)
  revalidatePath(`/nomina/${empleadoId}`)
  redirect(`/nomina/${empleadoId}`)
}

export async function registrarPagoNomina(empleadoId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const raw = Object.fromEntries(formData.entries())
  const parsed = PagoNominaSchema.safeParse({ ...raw, empleado_id: empleadoId })
  if (!parsed.success) return { error: 'Datos inválidos', fieldErrors: parsed.error.flatten().fieldErrors }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  // 1) Crear el pago
  const { error: pagoErr } = await supabase.from('pagos_nomina').insert({
    ...parsed.data,
    capturado_por: user.id,
  })
  if (pagoErr) return { error: pagoErr.message }

  // 2) Crear transacción de gasto (categoría sueldo)
  const { data: emp } = await supabase.from('empleados').select('nombre').eq('id', empleadoId).single()
  const concepto = `Nómina ${emp?.nombre ?? ''} · ${parsed.data.fecha_pago}`
  await supabase.from('transacciones').insert({
    tipo: 'gasto',
    monto: parsed.data.total,
    moneda: parsed.data.moneda,
    fecha: parsed.data.fecha_pago,
    concepto,
    negocio_id: parsed.data.negocio_id,
    cuenta_id: parsed.data.cuenta_id,
    categoria: 'sueldo',
    metodo_captura: 'manual',
    capturado_por: user.id,
  })

  revalidatePath(`/nomina/${empleadoId}`)
  revalidatePath('/dashboard')
  revalidatePath('/transacciones')
  flashOk(`/nomina/${empleadoId}`, 'pago_nomina')
}
