/**
 * Cron MENSUAL — corre el día 1 a las 8am Cabo
 * Genera resumen del mes anterior y push a socios.
 */
import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos, TZ } from '@/lib/fechas'
import { formatInTimeZone } from 'date-fns-tz'
import { totalizar } from '@/lib/agregaciones'
import { calcularSaldos, type CuentaConSaldoInicial, type TxParaSaldo } from '@/lib/saldos'
import { formatMoney } from '@/lib/utils'
import { enviarPushAProfiles } from '@/lib/push/server'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const hoy = hoyEnCabos()

  // Solo corre el día 1 del mes (Vercel Hobby es daily)
  const dia = Number(hoy.slice(8, 10))
  if (dia !== 1) {
    return NextResponse.json({ skip: true, motivo: 'No es día 1' })
  }

  // Rango del mes anterior
  const hoyDate = new Date(hoy + 'T00:00:00')
  const inicioMes = new Date(hoyDate.getFullYear(), hoyDate.getMonth() - 1, 1)
  const finMes = new Date(hoyDate.getFullYear(), hoyDate.getMonth(), 0)
  const desde = inicioMes.toISOString().slice(0, 10)
  const hasta = finMes.toISOString().slice(0, 10)
  const labelMes = formatInTimeZone(inicioMes, TZ, 'MMMM yyyy')

  const [
    { data: tx },
    { data: cuentas },
    { data: txAll },
    { data: fx },
    { data: porCobrar },
    { data: porPagar },
    { data: socios },
  ] = await Promise.all([
    admin.from('transacciones').select('tipo, monto, moneda, fecha, categoria, negocio_id, monto_mxn_equivalente').gte('fecha', desde).lte('fecha', hasta),
    admin.from('cuentas').select('id, nombre, titular, tipo, moneda, saldo_inicial_mxn, saldo_inicial_usd, saldo_inicial_fecha, saldo_inicial_locked, saldo_inicial_notas').eq('activo', true),
    admin.from('transacciones').select('tipo, monto, moneda, cuenta_id, fecha'),
    admin.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
    admin.from('cuentas_por_cobrar').select('monto_total, monto_cobrado, moneda').neq('estado', 'cobrado').neq('estado', 'cancelado'),
    admin.from('cuentas_por_pagar').select('monto_total, monto_pagado, moneda').neq('estado', 'pagado').neq('estado', 'cancelado'),
    admin.from('profiles').select('id, role_id, roles(nombre)').eq('activo', true),
  ])

  const rate = fx ? Number(fx.rate_compra) : 17
  const t = totalizar(tx ?? [], rate)
  const saldos = calcularSaldos(
    (cuentas ?? []) as unknown as CuentaConSaldoInicial[],
    (txAll ?? []) as unknown as TxParaSaldo[],
    rate
  )

  const pcMxn = (porCobrar ?? []).reduce((s, c) => s + (c.moneda === 'MXN' ? Number(c.monto_total) - Number(c.monto_cobrado) : 0), 0)
  const pcUsd = (porCobrar ?? []).reduce((s, c) => s + (c.moneda === 'USD' ? Number(c.monto_total) - Number(c.monto_cobrado) : 0), 0)
  const ppMxn = (porPagar ?? []).reduce((s, c) => s + (c.moneda === 'MXN' ? Number(c.monto_total) - Number(c.monto_pagado) : 0), 0)
  const ppUsd = (porPagar ?? []).reduce((s, c) => s + (c.moneda === 'USD' ? Number(c.monto_total) - Number(c.monto_pagado) : 0), 0)

  const destinatarios = (socios ?? [])
    .filter((p) => {
      const r = p.roles as unknown as { nombre: string } | null
      return r?.nombre === 'admin' || r?.nombre === 'socio'
    })
    .map((p) => p.id)

  const utilMxn = t.utilidad_total_mxn

  if (destinatarios.length > 0) {
    await enviarPushAProfiles(destinatarios, {
      title: `📊 Cierre ${labelMes}`,
      body: [
        `Utilidad: ${formatMoney(utilMxn, 'MXN')}`,
        `Saldo total: ${formatMoney(saldos.total_mxn, 'MXN')}`,
        pcMxn + pcUsd > 0 ? `Por cobrar: ${formatMoney(pcMxn + pcUsd * rate, 'MXN')}` : '',
        ppMxn + ppUsd > 0 ? `Por pagar: ${formatMoney(ppMxn + ppUsd * rate, 'MXN')}` : '',
      ].filter(Boolean).join(' · '),
      url: '/dashboard',
      tag: 'mensual',
    })
  }

  // Insertar insight de radar también
  try {
    await admin.from('radar_insights').insert({
      tipo: utilMxn >= 0 ? 'oportunidad' : 'riesgo',
      titulo: `Cierre ${labelMes}: ${utilMxn >= 0 ? '+' : ''}${formatMoney(utilMxn, 'MXN')} utilidad`,
      resumen: `Ingresos ${formatMoney(t.ingresos_total_mxn, 'MXN')}, Gastos ${formatMoney(t.gastos_total_mxn, 'MXN')}. Saldo en cuentas: ${formatMoney(saldos.total_mxn, 'MXN')}.`,
      fuente: 'Cierre mensual',
      fuente_url: '/dashboard',
      impacto: 'media',
      aplica_a: ['general'],
      recomendacion: utilMxn < 0 ? 'Mes con pérdida — revisa gastos y categorías.' : 'Buena utilidad — considera redistribuir o invertir.',
      modelo_ia: 'cron-mensual',
      query_origen: 'mensual',
    })
  } catch {}

  return NextResponse.json({
    ok: true,
    mes: labelMes,
    utilidad: utilMxn,
    saldo_total: saldos.total_mxn,
    destinatarios: destinatarios.length,
  })
}
