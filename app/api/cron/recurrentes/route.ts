import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { hoyEnCabos } from '@/lib/fechas'
import { proximoConDiaDelMes, siguientePago, type Frecuencia } from '@/lib/proximo-pago'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const hoy = hoyEnCabos()

  // 1) Recurrentes que vencen hoy y no se han marcado pagados aún hoy
  const { data: vencen, error } = await supabase
    .from('gastos_recurrentes')
    .select('*')
    .eq('activo', true)
    .lte('proximo_pago', hoy)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const procesados: string[] = []
  const tareasGeneradas: string[] = []

  for (const r of vencen ?? []) {
    // Verifica si ya hay un pago registrado para este recurrente con fecha proximo_pago
    const { data: yaPagado } = await supabase
      .from('recurrentes_pagados')
      .select('id')
      .eq('recurrente_id', r.id)
      .eq('fecha_pago', r.proximo_pago)
      .maybeSingle()

    if (yaPagado) {
      // Avanzar próximo_pago si ya está pagado pero quedó atrás
      const proximo = r.dia_del_mes
        ? proximoConDiaDelMes(r.dia_del_mes, r.proximo_pago)
        : siguientePago(r.proximo_pago, r.frecuencia as Frecuencia)
      await supabase.from('gastos_recurrentes').update({ proximo_pago: proximo }).eq('id', r.id)
      continue
    }

    // Si el vencimiento fue antes de hoy y hay multa configurada, crear tarea con multa
    if (r.proximo_pago < hoy && r.multa_por_no_pago && r.responsable_id) {
      // Verifica que no haya ya una tarea creada por el auditor para este recurrente hoy
      const tituloTarea = `Pagar: ${r.nombre} (vencido ${r.proximo_pago})`
      const { data: tareaExistente } = await supabase
        .from('tareas')
        .select('id')
        .eq('titulo', tituloTarea)
        .maybeSingle()

      if (!tareaExistente) {
        const limite = new Date()
        limite.setDate(limite.getDate() + 1) // 24h para resolver
        const { data: tareaCreada } = await supabase
          .from('tareas')
          .insert({
            titulo: tituloTarea,
            descripcion: `Pagar ${r.nombre} y subir comprobante. Se generó multa por incumplimiento.`,
            creada_por: r.responsable_id,
            asignada_a: [r.responsable_id],
            fecha_limite: limite.toISOString(),
            prioridad: 'alta',
            estado: 'pendiente',
            negocio_id: r.negocio_id,
            categoria: 'pago',
            multa_monto: r.multa_por_no_pago,
            moneda_multa: r.moneda,
            creada_por_auditor: true,
          })
          .select('id')
          .single()
        if (tareaCreada) tareasGeneradas.push(tareaCreada.id)
      }
    }

    procesados.push(r.id)
  }

  return NextResponse.json({
    ok: true,
    fecha: hoy,
    procesados: procesados.length,
    tareas_generadas: tareasGeneradas.length,
  })
}
