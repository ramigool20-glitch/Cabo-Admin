'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { aMxnEquivalente } from '@/lib/fx/server'
import { hoyEnCabos } from '@/lib/fechas'

export async function agregarShoppingItem(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  const item = String(formData.get('item') || '').trim()
  const cantidad = String(formData.get('cantidad') || '').trim() || null
  const prioridad = String(formData.get('prioridad') || 'normal')

  if (!item) return { ok: false, error: 'Falta el item' }

  const admin = createAdminClient()
  const { error } = await admin.from('casa_shopping').insert({
    item,
    cantidad,
    prioridad,
    agregado_por: user.id,
    comprado: false,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/casa')
  return { ok: true }
}

export async function marcarComprado(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const admin = createAdminClient()
  await admin
    .from('casa_shopping')
    .update({
      comprado: true,
      comprado_at: new Date().toISOString(),
      comprado_por: user.id,
    })
    .eq('id', id)

  revalidatePath('/casa')
}

export async function reabrirItem(id: string) {
  const admin = createAdminClient()
  await admin
    .from('casa_shopping')
    .update({ comprado: false, comprado_at: null, comprado_por: null })
    .eq('id', id)
  revalidatePath('/casa')
}

export async function eliminarItem(id: string) {
  const admin = createAdminClient()
  await admin.from('casa_shopping').delete().eq('id', id)
  revalidatePath('/casa')
}

/**
 * Liquidar saldo entre roomates: crea una transacción tipo "liquidacion_socio"
 * para representar que un socio le pasó dinero al otro para empatar gastos compartidos.
 */
export async function liquidarSaldoRoomates(
  pagadorId: string,
  receptorId: string,
  monto: number,
  cuentaId: string | null
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'No autenticado' }

  if (monto <= 0) return { ok: false, error: 'Monto inválido' }

  // Busca negocio Casa
  const admin = createAdminClient()
  const { data: casa } = await admin.from('negocios').select('id').eq('tipo', 'casa').single()

  const fechaHoy = hoyEnCabos()
  const fx = await aMxnEquivalente(monto, 'MXN', fechaHoy)

  const { error } = await admin.from('transacciones').insert({
    tipo: 'liquidacion_socio',
    monto,
    moneda: 'MXN',
    monto_mxn_equivalente: fx.monto_mxn_equivalente,
    tipo_cambio_usado: fx.tipo_cambio_usado,
    fecha: fechaHoy,
    concepto: `Liquidación entre roomates`,
    categoria: 'liquidacion_roomate',
    negocio_id: casa?.id ?? null,
    cuenta_id: cuentaId,
    metodo_captura: 'liquidacion',
    capturado_por: user.id,
    // Reutilizamos campos del modelo: pagador → capturado_por
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/casa')
  revalidatePath('/dashboard')
  return { ok: true }
}
