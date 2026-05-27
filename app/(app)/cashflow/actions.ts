'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { aMxnEquivalente } from '@/lib/fx/server'

export type ActionState = { ok?: boolean; error?: string }

// ============================================================
// AGREGAR NUEVA CUENTA
// ============================================================
const CuentaSchema = z.object({
  nombre: z.string().min(1, 'Falta nombre'),
  titular: z.string().optional().nullable(),
  tipo: z.enum(['mercado_pago', 'stripe', 'efectivo', 'banco', 'tarjeta', 'otra']),
  moneda: z.enum(['MXN', 'USD']),
  notas: z.string().optional().nullable(),
})

export async function agregarCuenta(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const raw = Object.fromEntries(formData.entries())
  const parsed = CuentaSchema.safeParse({
    ...raw,
    titular: raw.titular || null,
    notas: raw.notas || null,
  })
  if (!parsed.success) return { error: 'Datos inválidos' }

  const admin = createAdminClient()
  const { error } = await admin.from('cuentas').insert({
    ...parsed.data,
    activo: true,
  })
  if (error) return { error: error.message }

  revalidatePath('/cashflow')
  return { ok: true }
}

// ============================================================
// CAPTURAR SALDO INICIAL (solo una vez por cuenta)
// ============================================================
const SaldoInicialSchema = z.object({
  cuenta_id: z.string().uuid(),
  saldo_inicial_mxn: z.coerce.number().default(0),
  saldo_inicial_usd: z.coerce.number().default(0),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notas: z.string().optional().nullable(),
})

export async function capturarSaldoInicial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const raw = Object.fromEntries(formData.entries())
  const parsed = SaldoInicialSchema.safeParse({
    ...raw,
    notas: raw.notas || null,
  })
  if (!parsed.success) return { error: 'Datos inválidos' }

  const admin = createAdminClient()

  // Verifica que no esté bloqueada ya
  const { data: cuenta } = await admin
    .from('cuentas')
    .select('saldo_inicial_locked')
    .eq('id', parsed.data.cuenta_id)
    .single()
  if (cuenta?.saldo_inicial_locked) {
    return { error: 'Este saldo ya fue capturado y bloqueado. Usa "Ajustar saldo" para corregir.' }
  }

  const { error } = await admin
    .from('cuentas')
    .update({
      saldo_inicial_mxn: parsed.data.saldo_inicial_mxn,
      saldo_inicial_usd: parsed.data.saldo_inicial_usd,
      saldo_inicial_fecha: parsed.data.fecha,
      saldo_inicial_notas: parsed.data.notas,
      saldo_inicial_capturado_por: user.id,
      saldo_inicial_locked: true,
    })
    .eq('id', parsed.data.cuenta_id)
  if (error) {
    if (/column.*saldo_inicial/.test(error.message)) {
      return { error: 'Falta pegar migración 0021_saldos_iniciales.sql en Supabase.' }
    }
    return { error: error.message }
  }

  revalidatePath('/cashflow')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ============================================================
// AJUSTE DE SALDO (crea una transacción con motivo)
// ============================================================
const AjusteSchema = z.object({
  cuenta_id: z.string().uuid(),
  tipo: z.enum(['entrada', 'salida']),
  monto: z.coerce.number().positive(),
  moneda: z.enum(['MXN', 'USD']),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  motivo: z.string().min(3, 'Motivo obligatorio (mínimo 3 caracteres)'),
})

export async function crearAjusteSaldo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const raw = Object.fromEntries(formData.entries())
  const parsed = AjusteSchema.safeParse(raw)
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors.motivo?.[0] || 'Datos inválidos'
    return { error: msg }
  }

  const fx = await aMxnEquivalente(parsed.data.monto, parsed.data.moneda, parsed.data.fecha)
  const tipoTx = parsed.data.tipo === 'entrada' ? 'ingreso' : 'gasto'

  const admin = createAdminClient()
  const { error } = await admin.from('transacciones').insert({
    tipo: tipoTx,
    monto: parsed.data.monto,
    moneda: parsed.data.moneda,
    monto_mxn_equivalente: fx.monto_mxn_equivalente,
    tipo_cambio_usado: fx.tipo_cambio_usado,
    fecha: parsed.data.fecha,
    cuenta_id: parsed.data.cuenta_id,
    categoria: 'ajuste-saldo',
    concepto: `Ajuste: ${parsed.data.motivo}`,
    notas: `Ajuste manual de saldo. Motivo: ${parsed.data.motivo}`,
    metodo_pago: 'otro',
    metodo_captura: 'manual',
    capturado_por: user.id,
  })
  if (error) return { error: error.message }

  revalidatePath('/cashflow')
  revalidatePath('/dashboard')
  revalidatePath('/transacciones')
  return { ok: true }
}

// ============================================================
// DESBLOQUEAR (solo admin, opcional)
// ============================================================
export async function desbloquearSaldoInicial(cuentaId: string): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('cuentas')
    .update({ saldo_inicial_locked: false })
    .eq('id', cuentaId)
  if (error) return { error: error.message }
  revalidatePath('/cashflow')
  return { ok: true }
}

export async function desactivarCuenta(cuentaId: string): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  await admin.from('cuentas').update({ activo: false }).eq('id', cuentaId)
  revalidatePath('/cashflow')
  return { ok: true }
}
