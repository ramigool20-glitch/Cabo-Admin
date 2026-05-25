'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { proximoConDiaDelMes, siguientePago, type Frecuencia } from '@/lib/proximo-pago'
import { hoyEnCabos } from '@/lib/fechas'

export type SaveGastoFijoPayload = {
  nombre: string
  monto: number
  moneda: 'MXN' | 'USD'
  frecuencia: Frecuencia
  dia_del_mes: number | null
  proximo_pago: string | null
  negocio_id: string | null
  cuenta_id: string | null
  responsable_id: string | null
  proveedor: string | null
  metodo_pago: string | null
  categoria: string | null
  multa_por_no_pago: number | null
  comprobante_requerido: boolean
}

function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/**
 * Recibe los IDs ya resueltos por el cliente. Inserta en gastos_recurrentes.
 */
export async function saveGastoFijo(payload: SaveGastoFijoPayload) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'No autenticado' }

  let proximo = payload.proximo_pago
  if (!proximo && payload.dia_del_mes) {
    proximo = proximoConDiaDelMes(payload.dia_del_mes, hoyEnCabos())
  }
  if (!proximo) {
    proximo = siguientePago(hoyEnCabos(), payload.frecuencia)
  }

  const { data, error } = await supabase
    .from('gastos_recurrentes')
    .insert({
      nombre: payload.nombre,
      monto: payload.monto,
      moneda: payload.moneda,
      frecuencia: payload.frecuencia,
      dia_del_mes: payload.dia_del_mes,
      proximo_pago: proximo,
      negocio_id: payload.negocio_id,
      cuenta_id: payload.cuenta_id,
      responsable_id: payload.responsable_id,
      proveedor: payload.proveedor,
      metodo_pago: payload.metodo_pago,
      categoria: payload.categoria,
      multa_por_no_pago: payload.multa_por_no_pago,
      comprobante_requerido: payload.comprobante_requerido,
      activo: true,
    })
    .select('id')
    .single()

  if (error) return { ok: false as const, error: error.message }

  revalidatePath('/recurrentes')
  revalidatePath('/dashboard')
  return { ok: true as const, id: data.id }
}

/**
 * Helper para resolver un nombre fuzzy a ID (negocio, cuenta, profile).
 */
export async function resolverIds(payload: {
  negocio_nombre?: string | null
  cuenta_nombre?: string | null
  responsable_nombre?: string | null
}) {
  const admin = createAdminClient()
  const [{ data: negocios }, { data: cuentas }, { data: profiles }] = await Promise.all([
    admin.from('negocios').select('id, nombre').eq('activo', true),
    admin.from('cuentas').select('id, nombre').eq('activo', true),
    admin.from('profiles').select('id, nombre').eq('activo', true),
  ])

  const findByName = <T extends { nombre: string }>(list: T[] | null, hint?: string | null) => {
    if (!hint || !list) return null
    const h = norm(hint)
    return (
      list.find((x) => norm(x.nombre) === h) ||
      list.find((x) => norm(x.nombre).includes(h) || h.includes(norm(x.nombre))) ||
      null
    )
  }

  return {
    negocio: findByName(negocios, payload.negocio_nombre),
    cuenta: findByName(cuentas, payload.cuenta_nombre),
    responsable: findByName(profiles, payload.responsable_nombre),
  }
}
