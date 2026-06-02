/**
 * Resumen ejecutivo semanal con IA.
 *
 * Calcula métricas REALES (no inventadas) de la semana pasada y le pide a
 * Claude que las narre en 4-6 bullets ejecutivos. La narrativa SOLO redacta;
 * los números vienen 100% de la base de datos.
 *
 * Semana = lunes a domingo en TZ America/Mazatlan.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'

export type ResumenSemanalDatos = {
  semana_inicio: string  // YYYY-MM-DD (lunes)
  semana_fin: string     // YYYY-MM-DD (domingo)
  total_ingresos_mxn: number
  total_gastos_mxn: number
  neto_mxn: number
  num_transacciones: number
  por_negocio: Array<{ negocio_id: string; nombre: string; ingresos: number; gastos: number; neto: number; num_tx: number }>
  cambio_pct: { ingresos: number | null; gastos: number | null; neto: number | null }
  top_gastos: Array<{ concepto: string; monto_mxn: number; fecha: string; negocio: string | null }>
  top_ingresos: Array<{ concepto: string; monto_mxn: number; fecha: string; negocio: string | null }>
  alertas_count: number
}

/** Devuelve el lunes anterior y el domingo correspondiente (semana cerrada). */
export function semanaAnterior(hoy: string): { inicio: string; fin: string } {
  const d = new Date(hoy + 'T12:00:00')
  const dow = d.getDay() // 0=dom, 1=lun, ...
  // Lunes de ESTA semana
  const lunesEstaSemana = new Date(d)
  const offset = dow === 0 ? -6 : 1 - dow
  lunesEstaSemana.setDate(d.getDate() + offset)
  // Restar 7 para llegar al lunes pasado
  const lunesPasado = new Date(lunesEstaSemana)
  lunesPasado.setDate(lunesEstaSemana.getDate() - 7)
  const domingoPasado = new Date(lunesPasado)
  domingoPasado.setDate(lunesPasado.getDate() + 6)
  return {
    inicio: lunesPasado.toISOString().slice(0, 10),
    fin: domingoPasado.toISOString().slice(0, 10),
  }
}

export async function calcularDatosSemana(
  admin: SupabaseClient,
  semana: { inicio: string; fin: string },
): Promise<ResumenSemanalDatos> {
  const { data: txs } = await admin
    .from('transacciones')
    .select('id, tipo, monto, moneda, monto_mxn_equivalente, fecha, concepto, negocio_id, negocios(nombre)')
    .gte('fecha', semana.inicio)
    .lte('fecha', semana.fin)

  // Semana previa para comparativo
  const inicioPrev = new Date(semana.inicio + 'T12:00:00')
  inicioPrev.setDate(inicioPrev.getDate() - 7)
  const finPrev = new Date(semana.fin + 'T12:00:00')
  finPrev.setDate(finPrev.getDate() - 7)
  const { data: txsPrev } = await admin
    .from('transacciones')
    .select('tipo, monto, moneda, monto_mxn_equivalente')
    .gte('fecha', inicioPrev.toISOString().slice(0, 10))
    .lte('fecha', finPrev.toISOString().slice(0, 10))

  const { data: fxRow } = await admin
    .from('fx_rates')
    .select('rate_compra')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  const fx = fxRow ? Number(fxRow.rate_compra) : 17

  const mxnDe = (t: { monto: number | string; moneda: string; monto_mxn_equivalente?: number | string | null }) => {
    const e = t.monto_mxn_equivalente
    if (e != null) return Number(e)
    return t.moneda === 'USD' ? Number(t.monto) * fx : Number(t.monto)
  }

  // Totales semana actual
  let ingresos = 0, gastos = 0
  const porNeg = new Map<string, { negocio_id: string; nombre: string; ingresos: number; gastos: number; num_tx: number }>()
  for (const t of (txs ?? []) as any[]) {  // eslint-disable-line @typescript-eslint/no-explicit-any
    const mxn = mxnDe(t)
    const negId = t.negocio_id ?? 'sin_negocio'
    const negNombre = t.negocios?.nombre ?? 'Sin negocio'
    if (!porNeg.has(negId)) porNeg.set(negId, { negocio_id: negId, nombre: negNombre, ingresos: 0, gastos: 0, num_tx: 0 })
    const n = porNeg.get(negId)!
    n.num_tx++
    if (t.tipo === 'ingreso') { ingresos += mxn; n.ingresos += mxn }
    else if (t.tipo === 'gasto' || t.tipo === 'multa_interna') { gastos += mxn; n.gastos += mxn }
  }

  // Totales semana previa
  let ingresosPrev = 0, gastosPrev = 0
  for (const t of (txsPrev ?? []) as any[]) {  // eslint-disable-line @typescript-eslint/no-explicit-any
    const mxn = mxnDe(t)
    if (t.tipo === 'ingreso') ingresosPrev += mxn
    else if (t.tipo === 'gasto' || t.tipo === 'multa_interna') gastosPrev += mxn
  }
  const netoActual = ingresos - gastos
  const netoPrev = ingresosPrev - gastosPrev

  const pct = (a: number, p: number): number | null => {
    if (p === 0) return null
    return ((a - p) / Math.abs(p)) * 100
  }

  // Top 5 gastos e ingresos
  const txsConMxn = (txs ?? []).map((t: any) => ({  // eslint-disable-line @typescript-eslint/no-explicit-any
    concepto: t.concepto ?? 'Sin concepto',
    monto_mxn: mxnDe(t),
    fecha: t.fecha,
    negocio: t.negocios?.nombre ?? null,
    tipo: t.tipo,
  }))
  const topGastos = txsConMxn.filter((t) => t.tipo === 'gasto').sort((a, b) => b.monto_mxn - a.monto_mxn).slice(0, 5)
    .map(({ concepto, monto_mxn, fecha, negocio }) => ({ concepto, monto_mxn, fecha, negocio }))
  const topIngresos = txsConMxn.filter((t) => t.tipo === 'ingreso').sort((a, b) => b.monto_mxn - a.monto_mxn).slice(0, 5)
    .map(({ concepto, monto_mxn, fecha, negocio }) => ({ concepto, monto_mxn, fecha, negocio }))

  // Alertas activas (irregularidades sin resolver)
  const { count: alertasCount } = await admin
    .from('auditor_observaciones')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente')
    .gte('created_at', semana.inicio)

  return {
    semana_inicio: semana.inicio,
    semana_fin: semana.fin,
    total_ingresos_mxn: ingresos,
    total_gastos_mxn: gastos,
    neto_mxn: netoActual,
    num_transacciones: (txs ?? []).length,
    por_negocio: Array.from(porNeg.values())
      .map((n) => ({ ...n, neto: n.ingresos - n.gastos }))
      .sort((a, b) => b.ingresos + b.gastos - (a.ingresos + a.gastos)),
    cambio_pct: {
      ingresos: pct(ingresos, ingresosPrev),
      gastos: pct(gastos, gastosPrev),
      neto: pct(netoActual, netoPrev),
    },
    top_gastos: topGastos,
    top_ingresos: topIngresos,
    alertas_count: alertasCount ?? 0,
  }
}

/** Pide a Claude que narre los datos. La IA NO inventa números — solo redacta. */
export async function generarNarrativaIA(datos: ResumenSemanalDatos): Promise<string> {
  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-MX')
  const pctTxt = (p: number | null) => p == null ? 's/d' : (p >= 0 ? '+' : '') + p.toFixed(0) + '%'

  const contexto = `Datos reales de la semana ${datos.semana_inicio} a ${datos.semana_fin}:

INGRESOS TOTAL: ${fmt(datos.total_ingresos_mxn)} MXN (vs semana previa: ${pctTxt(datos.cambio_pct.ingresos)})
GASTOS TOTAL:   ${fmt(datos.total_gastos_mxn)} MXN (vs semana previa: ${pctTxt(datos.cambio_pct.gastos)})
NETO:           ${fmt(datos.neto_mxn)} MXN (vs semana previa: ${pctTxt(datos.cambio_pct.neto)})
TRANSACCIONES:  ${datos.num_transacciones}
ALERTAS DEL AUDITOR ACTIVAS: ${datos.alertas_count}

POR NEGOCIO:
${datos.por_negocio.slice(0, 6).map((n) => `- ${n.nombre}: ingresos ${fmt(n.ingresos)} · gastos ${fmt(n.gastos)} · neto ${fmt(n.neto)} (${n.num_tx} tx)`).join('\n')}

TOP 3 GASTOS:
${datos.top_gastos.slice(0, 3).map((g) => `- ${g.concepto}${g.negocio ? ' (' + g.negocio + ')' : ''}: ${fmt(g.monto_mxn)}`).join('\n')}

TOP 3 INGRESOS:
${datos.top_ingresos.slice(0, 3).map((g) => `- ${g.concepto}${g.negocio ? ' (' + g.negocio + ')' : ''}: ${fmt(g.monto_mxn)}`).join('\n')}`

  const sysPrompt = `Eres el analista financiero de Cabo Admin, una contabilidad de 2 socios (Miguel y Sergio) que llevan múltiples negocios en Los Cabos: farmacias, clínica walk-in, eventos.

Tu tarea: redactar un resumen semanal ejecutivo en español mexicano para los socios. Estilo: directo, sin floretes, 4-6 bullets de máximo 1-2 líneas cada uno. Tono profesional pero relajado (no acartonado).

REGLAS:
- USA SOLO los números que te dieron. NO inventes nada (ni "estimo que…" ni "probablemente…").
- Si un número es 0 o no hay data, di "sin movimiento" o "no aplica".
- Resalta lo bueno y lo malo equilibradamente.
- Si neto < 0, sé directo sin alarmista.
- Termina con UN action item concreto basado en los datos (no genérico).
- Markdown simple: bullets con "-" y máximo **negritas** en cifras clave.
- NO uses encabezados (#). NO uses emojis al inicio de cada bullet (solo en cifras o métricas importantes si ayuda).`

  const res = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 700,
    system: sysPrompt,
    messages: [{ role: 'user', content: contexto + '\n\nGenera el resumen ejecutivo.' }],
  })
  const block = res.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text.trim() : 'Resumen no disponible.'
}
