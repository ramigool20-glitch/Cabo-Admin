/**
 * Cron de Settlement Reports MP (FASE C).
 *
 * Por cada integración MP activa:
 *   1. Solicita un reporte de las últimas 24h (si no hay pending del día)
 *   2. Lista los reportes existentes
 *   3. Para cada reporte 'processed' no procesado todavía, descarga el CSV
 *   4. Extrae todos los SOURCE_ID y los procesa con procesarPagoMP
 *      (que ya hace detección de ingreso vs gasto, comisiones, push, etc.)
 *
 * Idea: este cron se llama cada 30 min. La primera vez del día solicita
 * el reporte; las siguientes esperan a que MP lo procese y lo descargan.
 * Como procesarPagoMP es idempotente (chequea mp_pagos_procesados), no
 * duplica nada.
 *
 * Ejecuta cada 30 min: schedule `*\/30 * * * *` en vercel.json.
 */
import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  solicitarReporteSettlement,
  listarReportes,
  descargarReporte,
  parsearCSV,
  extraerSourceIds,
} from '@/lib/integraciones/mp-reports'
import { procesarPagoMP } from '@/lib/integraciones/mercadopago'
import { logWebhook } from '@/lib/integraciones/webhook-log'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 min — descarga + procesamiento puede tomar tiempo

export async function GET(req: Request) {
  const t0 = Date.now()
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: integraciones } = await admin
    .from('integraciones_mp')
    .select('id, nombre, access_token')
    .eq('activa', true)

  const resumen: Array<{
    integracion: string
    solicitado?: number
    reportes_descargados?: number
    sources_procesados?: number
    creadas?: number
    error?: string
  }> = []

  for (const integ of integraciones ?? []) {
    const r: typeof resumen[number] = { integracion: integ.nombre }
    try {
      // 1. ¿Hay un reporte pending o processed del día?
      const reportes = await listarReportes(integ.access_token)
      const hoy = new Date().toISOString().slice(0, 10)
      const hayDelDia = reportes.some(rep => rep.date_created?.startsWith(hoy))

      // Si no hay reporte del día, solicitar uno (últimas 48h para cubrir)
      if (!hayDelDia) {
        const desde = new Date(Date.now() - 48 * 60 * 60 * 1000)
        const hasta = new Date()
        const sol = await solicitarReporteSettlement(integ.access_token, desde, hasta)
        if (!sol.ok) {
          r.error = `solicitar: ${sol.error}`
          resumen.push(r)
          continue
        }
        r.solicitado = sol.id
      }

      // 2. Procesar los reportes processed que aún no hayamos visto
      const procesados = reportes.filter(rep => rep.status === 'processed' && rep.file_name)
      // Tomamos los más recientes primero
      procesados.sort((a, b) => b.id - a.id)

      // Para evitar reprocesar el mismo reporte: chequeamos `mp_pagos_procesados`
      // por una "marca" tipo `report:<id>`. Si ya existe, saltamos.
      const idsProcesados = new Set<number>()
      {
        const { data: marcas } = await admin
          .from('mp_pagos_procesados')
          .select('mp_payment_id')
          .like('mp_payment_id', 'report:%')
          .eq('integracion_id', integ.id)
        for (const m of marcas ?? []) {
          const id = Number(m.mp_payment_id.replace('report:', ''))
          if (!isNaN(id)) idsProcesados.add(id)
        }
      }

      let reportesDescargados = 0
      let sourcesProcesados = 0
      let creadas = 0

      // Solo procesamos los 3 reportes más recientes para no exceder timeout
      for (const rep of procesados.slice(0, 3)) {
        if (idsProcesados.has(rep.id)) continue

        const csv = await descargarReporte(integ.access_token, rep.file_name)
        const rows = parsearCSV(csv)
        const sourceIds = extraerSourceIds(rows)
        reportesDescargados++

        for (const sid of sourceIds) {
          const res = await procesarPagoMP(sid, integ.id)
          sourcesProcesados++
          if (res.creada) creadas++
        }

        // Marcar el reporte como procesado para no volver a abrirlo
        await admin.from('mp_pagos_procesados').insert({
          mp_payment_id: `report:${rep.id}`,
          integracion_id: integ.id,
          monto: 0,
          moneda: rep.currency_id ?? 'MXN',
          estado: 'report_processed',
        })
      }

      r.reportes_descargados = reportesDescargados
      r.sources_procesados = sourcesProcesados
      r.creadas = creadas
    } catch (e) {
      r.error = e instanceof Error ? e.message : 'unknown'
    }
    resumen.push(r)
  }

  await logWebhook({
    fuente: 'cron_mp_sync',
    ok: true,
    http_method: 'GET',
    request_url: req.url,
    resultado: { tipo: 'mp_reports', resumen },
    duracion_ms: Date.now() - t0,
  })

  return NextResponse.json({ ok: true, resumen })
}
