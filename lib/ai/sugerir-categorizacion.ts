/**
 * Sugerencias de categoría/negocio/cuenta basadas en histórico.
 *
 * Estrategia híbrida:
 *  1) Match exacto / fuzzy del concepto en últimos 180d → si hay >=2 tx con mismo
 *     concepto, sugiere lo más usado (rápido, sin IA, gratis).
 *  2) Si no hay suficiente histórico, usa IA con los top 30 conceptos+labels
 *     del negocio como contexto.
 *
 * NUNCA inventa: solo sugiere combinaciones que ya existen en la BD.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'

export type Sugerencia = {
  categoria: string | null
  negocio_id: string | null
  negocio_nombre: string | null
  cuenta_id: string | null
  cuenta_nombre: string | null
  metodo_pago: string | null
  confianza: 'alta' | 'media' | 'baja'
  fuente: 'historico_exacto' | 'historico_fuzzy' | 'ia'
  ejemplos_count: number
}

function normalizar(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function sugerirCategorizacion(
  admin: SupabaseClient,
  input: { concepto: string; tipo: 'ingreso' | 'gasto'; monto?: number },
): Promise<Sugerencia | null> {
  const concepto = input.concepto.trim()
  if (concepto.length < 3) return null

  const conceptoNorm = normalizar(concepto)

  // Histórico últimos 180 días
  const hace180 = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10)
  const { data: histRows } = await admin
    .from('transacciones')
    .select('concepto, categoria, negocio_id, cuenta_id, metodo_pago, tipo, negocios(nombre), cuentas(nombre)')
    .eq('tipo', input.tipo)
    .gte('fecha', hace180)
    .not('concepto', 'is', null)
    .order('fecha', { ascending: false })
    .limit(500)
  const hist = histRows ?? []

  // ── 1) Match exacto / por palabras clave ──────────────────────────
  const matches = hist.filter((t) => {
    const c = normalizar(t.concepto ?? '')
    if (c === conceptoNorm) return true
    // Match por palabras significativas (≥4 chars)
    const palabras = conceptoNorm.split(' ').filter((w) => w.length >= 4)
    if (palabras.length === 0) return false
    return palabras.some((w) => c.includes(w))
  })

  if (matches.length >= 2) {
    // Vota la combinación más frecuente
    const votos = new Map<string, { count: number; categoria: string | null; negocio_id: string | null; cuenta_id: string | null; metodo: string | null; ejemplo: typeof matches[0] }>()
    for (const m of matches) {
      const key = `${m.categoria}|${m.negocio_id}|${m.cuenta_id}|${m.metodo_pago}`
      if (!votos.has(key)) {
        votos.set(key, {
          count: 0,
          categoria: m.categoria,
          negocio_id: m.negocio_id,
          cuenta_id: m.cuenta_id,
          metodo: m.metodo_pago,
          ejemplo: m,
        })
      }
      votos.get(key)!.count++
    }
    const top = Array.from(votos.values()).sort((a, b) => b.count - a.count)[0]
    const conceptoExacto = matches.some((m) => normalizar(m.concepto ?? '') === conceptoNorm)
    return {
      categoria: top.categoria,
      negocio_id: top.negocio_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      negocio_nombre: (top.ejemplo.negocios as any)?.nombre ?? null,
      cuenta_id: top.cuenta_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cuenta_nombre: (top.ejemplo.cuentas as any)?.nombre ?? null,
      metodo_pago: top.metodo,
      confianza: top.count >= 3 ? 'alta' : top.count >= 2 ? 'media' : 'baja',
      fuente: conceptoExacto ? 'historico_exacto' : 'historico_fuzzy',
      ejemplos_count: top.count,
    }
  }

  // ── 2) IA como fallback (necesita ANTHROPIC_API_KEY) ─────────────
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (hist.length === 0) return null

  // Resumir histórico para que la IA elija de opciones EXISTENTES
  const negociosMap = new Map<string, string>()
  const cuentasMap = new Map<string, string>()
  const categorias = new Set<string>()
  for (const h of hist) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (h.negocio_id) negociosMap.set(h.negocio_id, (h.negocios as any)?.nombre ?? '?')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (h.cuenta_id) cuentasMap.set(h.cuenta_id, (h.cuentas as any)?.nombre ?? '?')
    if (h.categoria) categorias.add(h.categoria)
  }
  const negocios = Array.from(negociosMap.entries()).map(([id, nombre]) => ({ id, nombre }))
  const cuentas = Array.from(cuentasMap.entries()).map(([id, nombre]) => ({ id, nombre }))

  const ejemplos = hist.slice(0, 30).map((h) => ({
    concepto: h.concepto,
    categoria: h.categoria,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    negocio: (h.negocios as any)?.nombre,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cuenta: (h.cuentas as any)?.nombre,
  }))

  const sys = `Eres un asistente de contabilidad para Cabo Admin. Categorizas transacciones según patrones reales del histórico.

REGLAS:
- Devuelve UN JSON, sin markdown, con shape: {"categoria": string|null, "negocio_id": string|null, "cuenta_id": string|null, "confianza": "alta"|"media"|"baja", "razonamiento": string}
- Solo usa categorías, negocio_id y cuenta_id de las opciones que te paso. NO inventes.
- Si no hay un buen match, pon null en lo que no tengas confianza y confianza:"baja".
- razonamiento: 1 frase corta justificando.`

  const prompt = `Concepto a categorizar: "${concepto}" (${input.tipo}${input.monto ? `, $${input.monto}` : ''})

Categorías disponibles: ${Array.from(categorias).join(', ')}

Negocios disponibles (id → nombre):
${negocios.map((n) => `${n.id} → ${n.nombre}`).join('\n')}

Cuentas disponibles (id → nombre):
${cuentas.map((c) => `${c.id} → ${c.nombre}`).join('\n')}

Ejemplos del histórico:
${ejemplos.map((e) => `- "${e.concepto}" → ${e.categoria ?? '-'} | ${e.negocio ?? '-'} | ${e.cuenta ?? '-'}`).join('\n')}

Devuelve solo el JSON.`

  try {
    const res = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system: sys,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content.find((b) => b.type === 'text')
    if (!text || text.type !== 'text') return null
    const cleaned = text.text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
    const parsed = JSON.parse(cleaned) as {
      categoria: string | null
      negocio_id: string | null
      cuenta_id: string | null
      confianza: 'alta' | 'media' | 'baja'
    }
    // Validar que los IDs sean reales (no inventados)
    const negOk = !parsed.negocio_id || negociosMap.has(parsed.negocio_id)
    const cueOk = !parsed.cuenta_id || cuentasMap.has(parsed.cuenta_id)
    if (!negOk) parsed.negocio_id = null
    if (!cueOk) parsed.cuenta_id = null
    return {
      categoria: parsed.categoria,
      negocio_id: parsed.negocio_id,
      negocio_nombre: parsed.negocio_id ? negociosMap.get(parsed.negocio_id) ?? null : null,
      cuenta_id: parsed.cuenta_id,
      cuenta_nombre: parsed.cuenta_id ? cuentasMap.get(parsed.cuenta_id) ?? null : null,
      metodo_pago: null,
      confianza: parsed.confianza,
      fuente: 'ia',
      ejemplos_count: 0,
    }
  } catch {
    return null
  }
}
