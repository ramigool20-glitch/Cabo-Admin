/**
 * Pedido sugerido por IA — v2 con Claude Sonnet real.
 *
 * Mejoras vs v1:
 *   • Claude Sonnet decide qué comprar dentro de un PRESUPUESTO
 *   • Considera: margen, ventas históricas, agotamiento, precio
 *   • Penaliza productos caros sin rotación
 *   • Limita cantidad según rentabilidad y rotación
 *   • Resultado: 15-30 productos top, no 80 sin filtro
 *
 * Fallback: si IA falla (timeout, error), retorna reglas determinísticas
 *           (la versión anterior) para no dejar al usuario sin respuesta.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BodySchema = z.object({
  presupuesto_mxn: z.coerce.number().min(500).max(500000).optional(),
}).optional()

export type ItemPedido = {
  codigo_barras: string | null
  nombre: string
  categoria: string | null
  stock_actual: number
  stock_minimo: number
  ventas_30d: number
  cantidad_sugerida: number
  prioridad: 'alta' | 'media' | 'baja'
  costo_estimado_mxn: number
  justificacion: string
  margen_pct?: number | null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = BodySchema.safeParse(body)
  const presupuesto = parsed.success ? (parsed.data?.presupuesto_mxn ?? 20000) : 20000

  const admin = createAdminClient()

  // 1. Productos críticos (stock <= minimo) con todos los datos relevantes
  const { data: rows, error: prodErr } = await admin
    .from('inventario_productos')
    .select('id, nombre, categoria, codigo_barras, precio_mxn, costo_mxn, stock, stock_minimo, marca')
    .eq('activo', true)
  if (prodErr) return NextResponse.json({ error: prodErr.message }, { status: 500 })

  const productos = rows ?? []
  const criticos = productos.filter(p => Number(p.stock ?? 0) <= Number(p.stock_minimo ?? 3))
  if (criticos.length === 0) {
    return NextResponse.json({
      ok: true,
      items: [],
      total_costo_mxn: 0,
      mensaje: 'No hay productos críticos. Inventario sano.',
    })
  }

  // 2. Movimientos últimos 30d
  const hace30 = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data: movs } = await admin
    .from('inventario_movimientos')
    .select('producto_id, tipo, cantidad')
    .in('tipo', ['venta', 'salida'])
    .gte('created_at', hace30)
  const ventasPorProducto = new Map<string, number>()
  for (const m of movs ?? []) {
    const id = String(m.producto_id)
    ventasPorProducto.set(id, (ventasPorProducto.get(id) ?? 0) + Math.abs(Number(m.cantidad ?? 0)))
  }

  // 3. Margen promedio por categoría (contexto para IA)
  const margenPorCat = new Map<string, { sum: number; count: number }>()
  for (const p of productos) {
    if (!p.categoria || !p.costo_mxn || Number(p.costo_mxn) <= 0) continue
    const m = ((Number(p.precio_mxn) - Number(p.costo_mxn)) / Number(p.precio_mxn)) * 100
    const prev = margenPorCat.get(p.categoria) ?? { sum: 0, count: 0 }
    margenPorCat.set(p.categoria, { sum: prev.sum + m, count: prev.count + 1 })
  }
  const margenStats: Record<string, number> = {}
  for (const [cat, v] of margenPorCat) {
    margenStats[cat] = Number((v.sum / v.count).toFixed(1))
  }

  // 4. Preparar input para IA (max 100 productos críticos)
  const items = criticos.slice(0, 100).map(p => {
    const precio = Number(p.precio_mxn ?? 0)
    const costo = p.costo_mxn != null ? Number(p.costo_mxn) : null
    const margen = costo && precio > 0 ? Number((((precio - costo) / precio) * 100).toFixed(1)) : null
    return {
      id: p.id,
      nombre: p.nombre,
      categoria: p.categoria,
      codigo: p.codigo_barras,
      marca: p.marca,
      precio,
      costo,
      margen_pct: margen,
      stock: Number(p.stock ?? 0),
      minimo: Number(p.stock_minimo ?? 3),
      ventas_30d: ventasPorProducto.get(p.id) ?? 0,
    }
  })

  // 5. Prompt estratégico a Claude
  const prompt = `Eres asistente de compras de una farmacia/abarrotes en Baja California Sur, México.

PRESUPUESTO DISPONIBLE: $${presupuesto.toLocaleString('es-MX')} MXN

CONTEXTO — margen promedio por categoría:
${JSON.stringify(margenStats)}

PRODUCTOS CRÍTICOS (${items.length} con stock <= mínimo):
${JSON.stringify(items)}

TU TAREA: decidir QUÉ productos comprar y CUÁNTAS unidades, MAXIMIZANDO el retorno del presupuesto.

REGLAS DE DECISIÓN:
1. PRIORIDAD ALTA (compra primero):
   - Productos AGOTADOS que se vendieron en 30d (rotación demostrada)
   - Productos con margen >= 30% y ventas >= 1u/30d
   - Productos económicos (<$200) que rotan mucho
2. PRIORIDAD MEDIA:
   - Productos bajo stock con ventas en 30d
   - Productos con margen alto sin ventas pero categoria buena (Bebidas, OTC, Cuidado Personal)
3. PRIORIDAD BAJA (solo si sobra presupuesto):
   - Productos sin ventas ni margen conocido — comprar pocas unidades
   - Productos muy caros (>$1000) sin rotación — máximo 2-3 unidades

REGLAS DE CANTIDAD:
- Productos <$50 que rotan: 12-24 unidades
- Productos $50-$200: 6-12 unidades
- Productos $200-$1000: 3-6 unidades
- Productos >$1000: 1-3 unidades MAX (capital atrapado)
- Si NO hay costo cargado: máximo 3 unidades (no sabemos rentabilidad)
- Si AGOTADO y vendió X en 30d: pedir max(X, 3)

NO EXCEDAS EL PRESUPUESTO. Suma de todos los costos <= $${presupuesto}.

Responde con SOLO un JSON válido, sin markdown, exactamente esta forma:

{
  "estrategia": "string corto explicando tu enfoque general (max 200 chars)",
  "items": [
    {
      "id": "uuid",
      "cantidad_sugerida": number,
      "prioridad": "alta" | "media" | "baja",
      "justificacion": "string max 80 chars explicando por qué este producto y cantidad"
    }
  ]
}`

  let parsedRespuesta: { estrategia?: string; items: Array<{ id: string; cantidad_sugerida: number; prioridad: 'alta' | 'media' | 'baja'; justificacion: string }> } | null = null
  let estrategiaIA: string | null = null

  try {
    const resp = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = resp.content
      .flatMap(b => b.type === 'text' ? [b.text] : [])
      .join('\n')
      .trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      parsedRespuesta = JSON.parse(jsonMatch[0])
      estrategiaIA = parsedRespuesta?.estrategia ?? null
    }
  } catch (e) {
    // Fallback silencioso a reglas determinísticas
    console.error('[pedido-sugerido] IA falló:', e instanceof Error ? e.message : 'unknown')
  }

  // 6. Si IA falló, fallback reglas v1
  let itemsFinal: ItemPedido[] = []
  let totalCosto = 0
  let usadoIA = false

  if (parsedRespuesta?.items) {
    // ✅ IA respondió: enriquecer con datos originales
    usadoIA = true
    const porId = new Map(items.map(i => [i.id, i]))
    for (const s of parsedRespuesta.items) {
      const orig = porId.get(s.id)
      if (!orig) continue
      const cant = Math.max(0, Math.round(s.cantidad_sugerida))
      if (cant === 0) continue
      const costo = cant * orig.precio
      totalCosto += costo
      itemsFinal.push({
        codigo_barras: orig.codigo,
        nombre: orig.nombre,
        categoria: orig.categoria,
        stock_actual: orig.stock,
        stock_minimo: orig.minimo,
        ventas_30d: orig.ventas_30d,
        cantidad_sugerida: cant,
        prioridad: s.prioridad,
        costo_estimado_mxn: costo,
        justificacion: s.justificacion,
        margen_pct: orig.margen_pct,
      })
    }
  } else {
    // ⚠ Fallback: aplicar reglas v1
    for (const p of items.slice(0, 50)) {
      const stock = p.stock
      const minimo = p.minimo
      const precio = p.precio
      const ventas = p.ventas_30d
      const agotado = stock === 0

      let cantidad: number, prioridad: ItemPedido['prioridad'], justificacion: string
      if (agotado && ventas > 0) { cantidad = Math.max(ventas, 6); prioridad = 'alta'; justificacion = `Agotado · vendió ${ventas}u en 30d` }
      else if (agotado) { cantidad = Math.max(minimo, 3); prioridad = 'baja'; justificacion = `Agotado · sin ventas recientes` }
      else if (ventas > 0) { cantidad = Math.max(ventas - stock, 3); prioridad = 'media'; justificacion = `Bajo stock · vendió ${ventas}u en 30d` }
      else { cantidad = Math.max(minimo * 2 - stock, 2); prioridad = 'baja'; justificacion = `Bajo stock · reabasto preventivo` }
      if (precio > 1000) cantidad = Math.min(cantidad, 3)
      if (precio < 50 && cantidad < 6 && ventas > 0) cantidad = 6

      cantidad = Math.max(0, Math.round(cantidad))
      const costo = cantidad * precio
      if (totalCosto + costo > presupuesto) continue
      totalCosto += costo
      itemsFinal.push({
        codigo_barras: p.codigo,
        nombre: p.nombre,
        categoria: p.categoria,
        stock_actual: p.stock,
        stock_minimo: p.minimo,
        ventas_30d: p.ventas_30d,
        cantidad_sugerida: cantidad,
        prioridad,
        costo_estimado_mxn: costo,
        justificacion,
        margen_pct: p.margen_pct,
      })
    }
  }

  // 7. Ordenar por prioridad y costo descendente
  const ordenPrioridad = { alta: 0, media: 1, baja: 2 }
  itemsFinal.sort((a, b) => {
    const p = ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad]
    if (p !== 0) return p
    return b.costo_estimado_mxn - a.costo_estimado_mxn
  })

  return NextResponse.json({
    ok: true,
    items: itemsFinal,
    total_costo_mxn: totalCosto,
    presupuesto_mxn: presupuesto,
    porcentaje_uso: presupuesto > 0 ? Number(((totalCosto / presupuesto) * 100).toFixed(1)) : 0,
    estrategia: estrategiaIA,
    motor: usadoIA ? 'claude-sonnet' : 'reglas-fallback',
    criticos_omitidos: Math.max(0, criticos.length - 100),
    generado_at: new Date().toISOString(),
  })
}
