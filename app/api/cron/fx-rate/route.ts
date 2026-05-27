import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchUsdMxn } from '@/lib/fx/fetch'
import { hoyEnCabos } from '@/lib/fechas'
import { enviarPushAProfiles } from '@/lib/push/server'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const hoy = hoyEnCabos()
  const fetched = await fetchUsdMxn()

  if (!fetched) {
    return NextResponse.json({ ok: false, error: 'No se pudo obtener el rate de ninguna fuente' }, { status: 503 })
  }

  // ¿Hay rate anterior para comparar?
  const { data: anterior } = await admin
    .from('fx_rates')
    .select('rate_compra')
    .lt('fecha', hoy)
    .order('fecha', { ascending: false })
    .limit(1)
    .single()

  // Upsert del rate de hoy (no sobrescribe si ya fue puesto manual)
  const { data: existente } = await admin
    .from('fx_rates')
    .select('manual')
    .eq('fecha', hoy)
    .single()

  if (existente?.manual) {
    return NextResponse.json({
      ok: true,
      skipped: 'manual override existe para hoy',
      hoy_existente: true,
    })
  }

  const { error } = await admin
    .from('fx_rates')
    .upsert({
      fecha: hoy,
      rate_compra: fetched.rate_compra,
      rate_venta: fetched.rate_venta,
      mid_rate: fetched.mid_rate,
      source: fetched.source,
      manual: false,
      fetched_at: fetched.fetched_at,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'fecha' })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Variación vs día anterior
  let variacion: number | null = null
  let mensaje = `💵 USD hoy: $${fetched.rate_compra.toFixed(2)} MXN (compra)`
  if (anterior && anterior.rate_compra) {
    const ant = Number(anterior.rate_compra)
    variacion = fetched.rate_compra - ant
    const sign = variacion > 0 ? '▲' : variacion < 0 ? '▼' : '='
    const abs = Math.abs(variacion).toFixed(3)
    mensaje = `💵 USD: $${fetched.rate_compra.toFixed(2)} MXN  ${sign}${abs} vs ayer (${ant.toFixed(2)})`
  }

  // Avisar a socios si la variación es > 0.20 pesos (movimiento notable)
  if (variacion !== null && Math.abs(variacion) >= 0.2) {
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

    if (destinatarios.length > 0) {
      await enviarPushAProfiles(destinatarios, {
        title: variacion > 0 ? '📈 USD subió' : '📉 USD bajó',
        body: mensaje,
        url: '/fx',
        tag: 'fx-daily',
      })
    }
  }

  return NextResponse.json({
    ok: true,
    fecha: hoy,
    ...fetched,
    variacion,
    mensaje,
  })
}
