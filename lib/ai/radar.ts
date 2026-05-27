import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos } from '@/lib/fechas'

export type RadarInsight = {
  tipo: 'noticia' | 'tendencia' | 'riesgo' | 'oportunidad' | 'evento_local'
  titulo: string
  resumen: string
  fuente: string | null
  fuente_url: string | null
  impacto: 'alta' | 'media' | 'baja'
  aplica_a: string[]
  recomendacion: string | null
  fecha_evento: string | null
}

/**
 * Radar determinístico basado en TU PROPIA DATA.
 *
 * Reemplaza el approach anterior de web search (poco confiable y propenso
 * a errores con SDK de OpenAI). Esta versión analiza patrones en tus
 * transacciones, gastos fijos, eventos, FX, balance, multas, tareas, etc.
 * y genera insights accionables específicos a tu negocio.
 *
 * 100% confiable, sin dependencias externas, sin errores de API.
 */
export async function ejecutarRadar(): Promise<{ insights: RadarInsight[]; error?: string }> {
  try {
    const admin = createAdminClient()
    const insights: RadarInsight[] = []
    const hoy = hoyEnCabos()

    // ============================================================
    // 1. CRECIMIENTO MES vs MES por negocio
    // ============================================================
    const inicioMesActual = hoy.slice(0, 7) + '-01'
    const inicioMesPrev = new Date(new Date(inicioMesActual + 'T00:00:00').getTime() - 24 * 60 * 60 * 1000)
    inicioMesPrev.setDate(1)
    const finMesPrev = new Date(inicioMesActual + 'T00:00:00')
    finMesPrev.setDate(0)
    const desdePrev = inicioMesPrev.toISOString().slice(0, 10)
    const hastaPrev = finMesPrev.toISOString().slice(0, 10)

    const [{ data: txActual }, { data: txPrev }, { data: negocios }] = await Promise.all([
      admin.from('transacciones').select('tipo, monto, moneda, fecha, categoria, negocio_id, monto_mxn_equivalente').gte('fecha', inicioMesActual).lte('fecha', hoy),
      admin.from('transacciones').select('tipo, monto, moneda, fecha, categoria, negocio_id, monto_mxn_equivalente').gte('fecha', desdePrev).lte('fecha', hastaPrev),
      admin.from('negocios').select('id, nombre, tipo').eq('activo', true),
    ])

    type TxRow = { monto: number | string; moneda: string; monto_mxn_equivalente?: number | string | null; tipo: string; categoria: string | null; negocio_id: string | null }
    const equivOf = (t: TxRow): number =>
      t.monto_mxn_equivalente != null ? Number(t.monto_mxn_equivalente) : (t.moneda === 'MXN' ? Number(t.monto) : 0)

    const negocioMap = new Map((negocios ?? []).map((n) => [n.id, { nombre: n.nombre, tipo: n.tipo }]))
    const sumPorNegocio = (rows: TxRow[] | null) => {
      const map = new Map<string, { gastos: number; ingresos: number }>()
      for (const t of rows ?? []) {
        if (!t.negocio_id) continue
        const entry = map.get(t.negocio_id) ?? { gastos: 0, ingresos: 0 }
        const eq = equivOf(t)
        if (t.tipo === 'gasto' || t.tipo === 'multa_interna') entry.gastos += eq
        else if (t.tipo === 'ingreso') entry.ingresos += eq
        map.set(t.negocio_id, entry)
      }
      return map
    }
    const actualN = sumPorNegocio((txActual ?? []) as TxRow[])
    const prevN = sumPorNegocio((txPrev ?? []) as TxRow[])

    for (const [negId, a] of actualN.entries()) {
      const p = prevN.get(negId) ?? { gastos: 0, ingresos: 0 }
      const neg = negocioMap.get(negId)
      if (!neg) continue
      if (p.gastos > 1000 && a.gastos > p.gastos * 1.3) {
        const pct = Math.round(((a.gastos - p.gastos) / p.gastos) * 100)
        insights.push({
          tipo: 'riesgo',
          titulo: `Gastos en "${neg.nombre}" subieron ${pct}%`,
          resumen: `Este mes llevas $${a.gastos.toFixed(0)} MXN en gastos. El mes pasado fueron $${p.gastos.toFixed(0)}.`,
          fuente: 'Análisis interno · Cabo Admin',
          fuente_url: '/transacciones',
          impacto: pct > 60 ? 'alta' : 'media',
          aplica_a: [neg.tipo],
          recomendacion: `Revisa categorías de "${neg.nombre}" para identificar dónde subió.`,
          fecha_evento: null,
        })
      }
      if (p.ingresos > 1000 && a.ingresos < p.ingresos * 0.8) {
        const pct = Math.round(((p.ingresos - a.ingresos) / p.ingresos) * 100)
        insights.push({
          tipo: 'riesgo',
          titulo: `Ingresos de "${neg.nombre}" bajaron ${pct}%`,
          resumen: `Llevas $${a.ingresos.toFixed(0)} MXN este mes vs $${p.ingresos.toFixed(0)} el anterior.`,
          fuente: 'Análisis interno',
          fuente_url: '/dashboard',
          impacto: 'alta',
          aplica_a: [neg.tipo],
          recomendacion: 'Investiga qué pasó. Temporada baja, cambio operativo o competencia.',
          fecha_evento: null,
        })
      }
      if (p.ingresos > 1000 && a.ingresos > p.ingresos * 1.3) {
        const pct = Math.round(((a.ingresos - p.ingresos) / p.ingresos) * 100)
        insights.push({
          tipo: 'oportunidad',
          titulo: `🚀 Ingresos de "${neg.nombre}" +${pct}%`,
          resumen: `Este mes $${a.ingresos.toFixed(0)} MXN vs $${p.ingresos.toFixed(0)} el anterior.`,
          fuente: 'Análisis interno',
          fuente_url: '/dashboard',
          impacto: 'media',
          aplica_a: [neg.tipo],
          recomendacion: `Identifica qué está funcionando en "${neg.nombre}" y dóblala.`,
          fecha_evento: null,
        })
      }
    }

    // ============================================================
    // 2. EVENTOS RANCHO MCCOY próximos con pendiente
    // ============================================================
    const en30 = new Date(new Date(hoy + 'T00:00:00').getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: eventos } = await admin
      .from('eventos')
      .select('id, cliente_nombre, fecha_evento, monto_total, moneda, eventos_pagos(monto)')
      .in('estado', ['reservado', 'confirmado'])
      .gte('fecha_evento', hoy)
      .lte('fecha_evento', en30)
      .order('fecha_evento')
    let totalPendiente = 0
    let countPendiente = 0
    const eventosCrit: Array<{ cliente: string; fecha: string; pendiente: number }> = []
    for (const e of eventos ?? []) {
      const pagos = (e.eventos_pagos as Array<{ monto: number }>) ?? []
      const cobrado = pagos.reduce((s, p) => s + Number(p.monto), 0)
      const pend = Number(e.monto_total) - cobrado
      if (pend > 0.01 && e.moneda === 'MXN') {
        totalPendiente += pend
        countPendiente++
        eventosCrit.push({ cliente: e.cliente_nombre, fecha: e.fecha_evento, pendiente: pend })
      }
    }
    if (countPendiente > 0) {
      insights.push({
        tipo: 'oportunidad',
        titulo: `$${totalPendiente.toFixed(0)} MXN por cobrar (eventos próximos 30 días)`,
        resumen: `${countPendiente} evento${countPendiente > 1 ? 's' : ''} pendiente${countPendiente > 1 ? 's' : ''}: ${eventosCrit.slice(0, 3).map((e) => `${e.cliente} (${e.fecha})`).join(', ')}.`,
        fuente: 'Eventos Rancho',
        fuente_url: '/por-cobrar',
        impacto: totalPendiente > 50000 ? 'alta' : 'media',
        aplica_a: ['salon_eventos'],
        recomendacion: 'Manda recordatorio de pago. Los anticipos confirman la reserva.',
        fecha_evento: eventos?.[0]?.fecha_evento ?? null,
      })
    }

    // ============================================================
    // 3. GASTOS FIJOS VENCIDOS
    // ============================================================
    const { data: vencidos } = await admin
      .from('gastos_recurrentes')
      .select('id, nombre, monto, moneda, proximo_pago')
      .eq('activo', true)
      .lt('proximo_pago', hoy)
    if (vencidos && vencidos.length > 0) {
      const totalVenc = vencidos.reduce((s, v) => s + Number(v.monto), 0)
      insights.push({
        tipo: 'riesgo',
        titulo: `${vencidos.length} gasto${vencidos.length > 1 ? 's' : ''} fijo${vencidos.length > 1 ? 's' : ''} vencido${vencidos.length > 1 ? 's' : ''}`,
        resumen: `Total $${totalVenc.toFixed(0)} MXN. Incluye: ${vencidos.slice(0, 3).map((v) => v.nombre).join(', ')}.`,
        fuente: 'Gastos Fijos',
        fuente_url: '/recurrentes',
        impacto: 'alta',
        aplica_a: ['general'],
        recomendacion: 'Marca como pagados los que ya cubriste, o paga los pendientes.',
        fecha_evento: null,
      })
    }

    // ============================================================
    // 4. CUENTAS POR PAGAR VENCIDAS
    // ============================================================
    const { data: cppVencidas } = await admin
      .from('cuentas_por_pagar')
      .select('id, proveedor, monto_total, monto_pagado, fecha_vencimiento')
      .in('estado', ['pendiente', 'parcial'])
      .lt('fecha_vencimiento', hoy)
    if (cppVencidas && cppVencidas.length > 0) {
      const totalVenc = cppVencidas.reduce((s, c) => s + (Number(c.monto_total) - Number(c.monto_pagado)), 0)
      insights.push({
        tipo: 'riesgo',
        titulo: `${cppVencidas.length} cuenta${cppVencidas.length > 1 ? 's' : ''} POR PAGAR vencida${cppVencidas.length > 1 ? 's' : ''}`,
        resumen: `Total $${totalVenc.toFixed(0)} MXN. Proveedores: ${cppVencidas.slice(0, 3).map((c) => c.proveedor).join(', ')}.`,
        fuente: 'Por Pagar',
        fuente_url: '/por-pagar',
        impacto: 'alta',
        aplica_a: ['general'],
        recomendacion: 'Págalas hoy o renegocia plazo. Las deudas con proveedores afectan tu reputación.',
        fecha_evento: null,
      })
    }

    // ============================================================
    // 5. FX USD/MXN — movimiento notable
    // ============================================================
    const { data: fxs } = await admin
      .from('fx_rates')
      .select('fecha, rate_compra')
      .order('fecha', { ascending: false })
      .limit(8)
    if (fxs && fxs.length >= 2) {
      const ahora = Number(fxs[0].rate_compra)
      const semanaAtras = Number(fxs[fxs.length - 1].rate_compra)
      const cambio = ahora - semanaAtras
      if (Math.abs(cambio) >= 0.3) {
        insights.push({
          tipo: cambio > 0 ? 'oportunidad' : 'riesgo',
          titulo: cambio > 0 ? `📈 USD subió $${cambio.toFixed(2)} esta semana` : `📉 USD bajó $${Math.abs(cambio).toFixed(2)}`,
          resumen: `Hoy: $${ahora.toFixed(2)} MXN. Hace ${fxs.length} días: $${semanaAtras.toFixed(2)}.`,
          fuente: 'FX rate · Cabo Admin',
          fuente_url: '/fx',
          impacto: Math.abs(cambio) > 0.5 ? 'alta' : 'media',
          aplica_a: ['pagina_digital', 'consultorio'],
          recomendacion: cambio > 0
            ? 'Aprovecha: tus ingresos USD valen más en MXN. Cobra pronto cuentas USD pendientes.'
            : 'USD bajó: si tienes USD pendientes, conviene esperar antes de convertir.',
          fecha_evento: null,
        })
      }
    }

    // ============================================================
    // 6. MULTAS SIN RESOLVER
    // ============================================================
    const { data: multas } = await admin
      .from('multas')
      .select('id, motivo, monto_propuesto, moneda, estado')
      .in('estado', ['propuesta', 'justificada', 'reduccion_solicitada', 'pendiente_conversacion'])
    if (multas && multas.length > 0) {
      const totalMultas = multas.reduce((s, m) => s + Number(m.monto_propuesto), 0)
      insights.push({
        tipo: 'riesgo',
        titulo: `${multas.length} multa${multas.length > 1 ? 's' : ''} sin resolver`,
        resumen: `Total $${totalMultas.toFixed(0)} MXN entre socios.`,
        fuente: 'Multas internas',
        fuente_url: '/multas',
        impacto: 'media',
        aplica_a: ['general'],
        recomendacion: 'Resuélvanlas hoy. Quedar en limbo causa fricción innecesaria.',
        fecha_evento: null,
      })
    }

    // ============================================================
    // 7. TAREAS VENCIDAS
    // ============================================================
    const { data: tareasVenc } = await admin
      .from('tareas')
      .select('id, titulo, fecha_limite, prioridad')
      .in('estado', ['pendiente', 'en_progreso'])
      .lt('fecha_limite', new Date().toISOString())
    if (tareasVenc && tareasVenc.length > 0) {
      insights.push({
        tipo: 'riesgo',
        titulo: `${tareasVenc.length} tarea${tareasVenc.length > 1 ? 's' : ''} vencida${tareasVenc.length > 1 ? 's' : ''}`,
        resumen: tareasVenc.slice(0, 3).map((t) => t.titulo).join(' · '),
        fuente: 'Tareas',
        fuente_url: '/tareas',
        impacto: tareasVenc.some((t) => t.prioridad === 'alta') ? 'alta' : 'media',
        aplica_a: ['general'],
        recomendacion: 'Complétalas o reasígnalas. Tareas vencidas con multa cuestan dinero real.',
        fecha_evento: null,
      })
    }

    // ============================================================
    // 8. TENDENCIA: categoría con crecimiento notable
    // ============================================================
    const catActual = new Map<string, number>()
    const catPrev = new Map<string, number>()
    for (const t of (txActual ?? []) as TxRow[]) {
      if (t.tipo !== 'gasto' || !t.categoria) continue
      catActual.set(t.categoria, (catActual.get(t.categoria) ?? 0) + equivOf(t))
    }
    for (const t of (txPrev ?? []) as TxRow[]) {
      if (t.tipo !== 'gasto' || !t.categoria) continue
      catPrev.set(t.categoria, (catPrev.get(t.categoria) ?? 0) + equivOf(t))
    }
    for (const [cat, a] of catActual.entries()) {
      const p = catPrev.get(cat) ?? 0
      if (p > 2000 && a > p * 1.5) {
        const pct = Math.round(((a - p) / p) * 100)
        insights.push({
          tipo: 'tendencia',
          titulo: `"${cat}" creció ${pct}%`,
          resumen: `Este mes $${a.toFixed(0)} MXN, antes $${p.toFixed(0)}.`,
          fuente: 'Análisis categorías',
          fuente_url: '/transacciones',
          impacto: pct > 100 ? 'alta' : 'media',
          aplica_a: ['general'],
          recomendacion: `Revisa qué transacciones componen "${cat}".`,
          fecha_evento: null,
        })
        break
      }
    }

    // ============================================================
    // 9. COMPETIDORES — sugerencias de análisis
    // ============================================================
    try {
      const { data: competidores, error: compError } = await admin
        .from('radar_competidores')
        .select('dominio_propio, competidor_nombre, descripcion, competidor_url, created_at')
        .eq('activo', true)
      // Solo procesa si la tabla existe
      if (!compError && competidores) {
        const conteoPorDominio = new Map<string, number>()
        for (const c of competidores) {
          conteoPorDominio.set(c.dominio_propio, (conteoPorDominio.get(c.dominio_propio) ?? 0) + 1)
        }

        // Dominios activos en negocios
        const dominiosActivos = new Set<string>()
        for (const n of negocios ?? []) {
          if (n.tipo && !['general', 'casa'].includes(n.tipo)) {
            dominiosActivos.add(n.tipo === 'pagina_digital' ? n.nombre.toLowerCase().replace(/\s+/g, '_') : n.tipo)
          }
        }

        // Sugerir registrar para dominios sin competidores (max 1 insight)
        for (const dom of dominiosActivos) {
          if (!conteoPorDominio.has(dom)) {
            insights.push({
              tipo: 'oportunidad',
              titulo: `Registra competidores de "${dom}"`,
              resumen: `No tienes competidores registrados para este negocio. Conocer la competencia te ayuda a posicionar precios y estrategia.`,
              fuente: 'Radar de competidores',
              fuente_url: '/radar',
              impacto: 'baja',
              aplica_a: [dom],
              recomendacion: 'Ve a /radar → tab Competidores → agrega 3-5 principales.',
              fecha_evento: null,
            })
            break
          }
        }

        // Sugerir revisión periódica si tienen varios
        for (const [dom, count] of conteoPorDominio.entries()) {
          if (count >= 3) {
            // Verificar si los registros tienen más de 14 días sin actualizar
            const recientes = competidores.filter((c) => c.dominio_propio === dom)
            const masViejos = recientes.reduce((min, c) => {
              const d = new Date(c.created_at).getTime()
              return d < min ? d : min
            }, Date.now())
            const diasDesde = Math.floor((Date.now() - masViejos) / (24 * 60 * 60 * 1000))
            if (diasDesde >= 14) {
              insights.push({
                tipo: 'tendencia',
                titulo: `Revisa competidores de "${dom}"`,
                resumen: `Tienes ${count} competidores registrados pero no se han actualizado en ${diasDesde} días. Sus precios o estrategia pudieron cambiar.`,
                fuente: 'Radar de competidores',
                fuente_url: '/radar',
                impacto: 'baja',
                aplica_a: [dom],
                recomendacion: 'Revisa sus URLs y actualiza descripciones con precios actuales.',
                fecha_evento: null,
              })
              break
            }
          }
        }
      }
    } catch {
      // Si la tabla de competidores no existe, simplemente skip
    }

    // ============================================================
    // 10. UTILIDAD GLOBAL
    // ============================================================
    const totalIngresoActual = (txActual ?? []).reduce((s, t) => s + (t.tipo === 'ingreso' ? equivOf(t as TxRow) : 0), 0)
    const totalGastoActual = (txActual ?? []).reduce((s, t) => s + ((t.tipo === 'gasto' || t.tipo === 'multa_interna') ? equivOf(t as TxRow) : 0), 0)
    const utilidadActual = totalIngresoActual - totalGastoActual
    if (totalIngresoActual > 0 && utilidadActual < 0) {
      insights.push({
        tipo: 'riesgo',
        titulo: `Utilidad negativa este mes: -$${Math.abs(utilidadActual).toFixed(0)} MXN`,
        resumen: `Ingresos $${totalIngresoActual.toFixed(0)} vs Gastos $${totalGastoActual.toFixed(0)}. Estás gastando más de lo que entras.`,
        fuente: 'Estado financiero',
        fuente_url: '/dashboard',
        impacto: 'alta',
        aplica_a: ['general'],
        recomendacion: 'Reduce gastos no esenciales o impulsa ingresos urgentemente.',
        fecha_evento: null,
      })
    }

    return { insights: insights.slice(0, 12) }
  } catch (e) {
    return { insights: [], error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}
