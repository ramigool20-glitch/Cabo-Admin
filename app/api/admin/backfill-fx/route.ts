import { NextResponse } from 'next/server'
import { requireSocio } from '@/lib/auth/require-socio'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { aMxnEquivalente } from '@/lib/fx/server'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Recalcula monto_mxn_equivalente para transacciones que NO lo tengan.
 * Usa el rate de la fecha de cada tx (búsqueda exacta o fallback al rate
 * anterior más cercano disponible en fx_rates).
 */
export async function POST() {
  const g = await requireSocio()
  if (g instanceof NextResponse) return g
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createAdminClient()

  // Traer todas las tx sin equivalente
  const { data: pendientes, error: selErr } = await admin
    .from('transacciones')
    .select('id, monto, moneda, fecha')
    .or('monto_mxn_equivalente.is.null,tipo_cambio_usado.is.null')
    .limit(2000)

  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 })
  if (!pendientes || pendientes.length === 0) {
    return NextResponse.json({ ok: true, procesadas: 0, mensaje: 'No hay transacciones pendientes' })
  }

  let procesadas = 0
  let fallidas = 0

  for (const t of pendientes) {
    try {
      const fx = await aMxnEquivalente(Number(t.monto), t.moneda as 'MXN' | 'USD', t.fecha)
      const { error } = await admin
        .from('transacciones')
        .update({
          monto_mxn_equivalente: fx.monto_mxn_equivalente,
          tipo_cambio_usado: fx.tipo_cambio_usado,
        })
        .eq('id', t.id)
      if (error) fallidas++
      else procesadas++
    } catch {
      fallidas++
    }
  }

  return NextResponse.json({
    ok: true,
    procesadas,
    fallidas,
    total: pendientes.length,
    mensaje: `Se recalcularon ${procesadas} transacciones${fallidas > 0 ? ` (${fallidas} fallaron)` : ''}`,
  })
}
