/**
 * IA-1: Sugerencia de costos para productos sin costo cargado.
 *
 * Recibe un batch de productos (max 25) sin costo y devuelve sugerencias:
 *   { producto_id, costo_sugerido_mxn, margen_esperado_pct, confianza }
 *
 * Estrategia:
 *   1. Pasa al modelo el batch + ejemplos de productos similares CON costo
 *      (para que use como ancla del margen típico de tu inventario)
 *   2. Claude sugiere costo basado en categoría, precio y similitud
 *   3. Confianza: alta si hay productos muy similares con costo,
 *      media si solo hay misma categoría, baja si no hay referencia
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BodySchema = z.object({
  producto_ids: z.array(z.string().uuid()).min(1).max(25),
})

export type SugerenciaCosto = {
  producto_id: string
  nombre: string
  precio_mxn: number
  costo_sugerido_mxn: number | null
  margen_esperado_pct: number | null
  confianza: 'alta' | 'media' | 'baja'
  razon: string
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const json = await req.json().catch(() => ({}))
  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Productos del batch
  const { data: pendientes } = await admin
    .from('inventario_productos')
    .select('id, nombre, precio_mxn, categoria, codigo_barras')
    .in('id', parsed.data.producto_ids)
  if (!pendientes || pendientes.length === 0) {
    return NextResponse.json({ error: 'Productos no encontrados' }, { status: 404 })
  }

  // 2. Productos CON costo como referencia (top 50 más representativos)
  const { data: conCosto } = await admin
    .from('inventario_productos')
    .select('nombre, categoria, precio_mxn, costo_mxn')
    .eq('activo', true)
    .gt('costo_mxn', 0)
    .order('precio_mxn', { ascending: false })
    .limit(60)

  // 3. Margen promedio por categoría (ancla)
  const margenesPorCat = new Map<string, { sum: number; count: number }>()
  for (const p of conCosto ?? []) {
    if (!p.categoria) continue
    const m = ((Number(p.precio_mxn) - Number(p.costo_mxn)) / Number(p.precio_mxn)) * 100
    const prev = margenesPorCat.get(p.categoria) ?? { sum: 0, count: 0 }
    margenesPorCat.set(p.categoria, { sum: prev.sum + m, count: prev.count + 1 })
  }
  const margenesEstadisticos: Record<string, number> = {}
  for (const [cat, v] of margenesPorCat) {
    margenesEstadisticos[cat] = Number((v.sum / v.count).toFixed(1))
  }

  // 4. Prompt al modelo
  const prompt = `Eres asistente de pricing de una farmacia/abarrotes en Baja California Sur, México.

OBJETIVO: estimar el costo de compra de cada producto basado en su precio de venta y categoría.

CONTEXTO — margen bruto promedio por categoría (de productos similares que SÍ tienen costo):
${JSON.stringify(margenesEstadisticos, null, 2)}

CONTEXTO — 30 productos similares CON costo conocido:
${JSON.stringify((conCosto ?? []).slice(0, 30).map(p => ({
  nombre: p.nombre,
  categoria: p.categoria,
  precio: Number(p.precio_mxn),
  costo: Number(p.costo_mxn),
  margen_pct: Number((((Number(p.precio_mxn) - Number(p.costo_mxn)) / Number(p.precio_mxn)) * 100).toFixed(1)),
})), null, 2)}

PRODUCTOS A ESTIMAR (no tienen costo):
${JSON.stringify(pendientes.map(p => ({
  id: p.id,
  nombre: p.nombre,
  categoria: p.categoria,
  precio: Number(p.precio_mxn),
})), null, 2)}

INSTRUCCIONES:
- Para cada producto, estima costo_sugerido basado en categoría y precio
- Usa el margen promedio de la categoría como ancla
- Si el producto se parece MUCHO a alguno de la lista CON costo, usa ese margen
- Productos farmacéuticos OTC/GENERICO: típicamente 40-60% margen
- PATENTE (medicamentos de marca): 25-40% margen
- Cuidado Personal/Bebidas: 30-50% margen
- Choco: 50-70% margen
- CONFIANZA:
  - alta: hay producto muy similar con costo, mismo formato
  - media: misma categoría, sin match exacto
  - baja: poca info o sin categoría

Responde SOLO con JSON válido, sin markdown:
{
  "sugerencias": [
    {
      "id": "uuid",
      "costo_sugerido_mxn": number,
      "margen_esperado_pct": number,
      "confianza": "alta" | "media" | "baja",
      "razon": "string breve (max 60 chars)"
    }
  ]
}`

  try {
    const resp = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = resp.content
      .flatMap(b => b.type === 'text' ? [b.text] : [])
      .join('\n')
      .trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'IA no devolvió JSON', raw: text.slice(0, 300) }, { status: 500 })
    }
    const parsed2 = JSON.parse(jsonMatch[0]) as {
      sugerencias: Array<{ id: string; costo_sugerido_mxn: number; margen_esperado_pct: number; confianza: 'alta' | 'media' | 'baja'; razon: string }>
    }

    // Enriquecer con nombre + precio
    const porId = new Map(pendientes.map(p => [p.id, p]))
    const enriquecidas: SugerenciaCosto[] = []
    for (const s of parsed2.sugerencias ?? []) {
      const orig = porId.get(s.id)
      if (!orig) continue
      enriquecidas.push({
        producto_id: s.id,
        nombre: orig.nombre as string,
        precio_mxn: Number(orig.precio_mxn),
        costo_sugerido_mxn: s.costo_sugerido_mxn,
        margen_esperado_pct: s.margen_esperado_pct,
        confianza: s.confianza,
        razon: s.razon,
      })
    }

    return NextResponse.json({ ok: true, sugerencias: enriquecidas })
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Error IA',
    }, { status: 500 })
  }
}
