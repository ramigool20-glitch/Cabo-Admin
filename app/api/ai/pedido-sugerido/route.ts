/**
 * Genera un pedido sugerido por IA.
 *
 * Toma todos los productos críticos (stock <= stock_minimo + agotados),
 * calcula velocidad de venta de los últimos 30d a partir de
 * inventario_movimientos (tipo='venta' o 'salida'), y le pasa todo a
 * Claude Sonnet para que sugiera CUÁNTO pedir de cada uno y la prioridad.
 *
 * Output estructurado JSON que el cliente formatea en CSV/texto/WhatsApp.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const admin = createAdminClient()

  // 1. Productos críticos (bajo stock o agotados)
  const { data: rows } = await admin
    .from('inventario_productos')
    .select('id, nombre, categoria, codigo_barras, precio_mxn, stock, stock_minimo')
    .eq('activo', true)
  const productos = rows ?? []
  const criticos = productos.filter(p => Number(p.stock ?? 0) <= Number(p.stock_minimo ?? 3))
  if (criticos.length === 0) {
    return NextResponse.json({
      ok: true,
      items: [],
      mensaje: 'No hay productos críticos. Inventario sano.',
    })
  }

  // 2. Movimientos de venta/salida de los últimos 30d → velocidad por producto
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

  // 3. Prepara el JSON que mandamos a Claude (máx 80 productos para no saturar)
  const items = criticos.slice(0, 80).map(p => ({
    id: p.id,
    nombre: p.nombre,
    categoria: p.categoria,
    codigo: p.codigo_barras,
    precio_mxn: Number(p.precio_mxn ?? 0),
    stock: Number(p.stock ?? 0),
    minimo: Number(p.stock_minimo ?? 3),
    ventas_30d: ventasPorProducto.get(p.id) ?? 0,
  }))

  const prompt = `Eres asistente de compras de una farmacia/abarrotes en Baja California Sur.
Tengo ${items.length} productos críticos (stock <= mínimo o agotados).

Para cada uno, sugiere cuántas unidades pedir basándote en:
- Si está agotado y se vende: prioridad ALTA, cantidad = max(ventas_30d, 10)
- Si está bajo stock pero rota: prioridad MEDIA, cantidad = ventas_30d - stock
- Si está bajo stock pero sin movimiento: prioridad BAJA, cantidad = minimo*2 - stock
- Productos con precio MXN > 1000 (alta gama): redondea conservador (no más de 5)
- Productos con precio MXN < 50 (consumibles): puedes sugerir 12-24

Cantidades enteras positivas. Costo_estimado = cantidad * precio_mxn.
Justificación: 1 frase, máximo 80 caracteres.

DATOS:
${JSON.stringify(items)}

Responde con SOLO un JSON válido, sin markdown, con esta forma:

{
  "items": [
    {
      "id": "uuid-del-producto",
      "cantidad_sugerida": number,
      "prioridad": "alta" | "media" | "baja",
      "justificacion": "string"
    }
  ]
}`

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
    if (!jsonMatch) {
      return NextResponse.json({ error: 'IA no devolvió JSON', raw: text.slice(0, 200) }, { status: 500 })
    }
    const parsed = JSON.parse(jsonMatch[0]) as {
      items: Array<{ id: string; cantidad_sugerida: number; prioridad: 'alta' | 'media' | 'baja'; justificacion: string }>
    }

    // 4. Merge con los datos originales del producto
    const porId = new Map(items.map(i => [i.id, i]))
    const enriquecidos: ItemPedido[] = []
    let totalCosto = 0
    for (const s of parsed.items ?? []) {
      const orig = porId.get(s.id)
      if (!orig) continue
      const cant = Math.max(0, Math.round(s.cantidad_sugerida))
      const costo = cant * orig.precio_mxn
      totalCosto += costo
      enriquecidos.push({
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
      })
    }

    // Ordena por prioridad y luego por costo descendente
    const ordenPrioridad = { alta: 0, media: 1, baja: 2 }
    enriquecidos.sort((a, b) => {
      const p = ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad]
      if (p !== 0) return p
      return b.costo_estimado_mxn - a.costo_estimado_mxn
    })

    return NextResponse.json({
      ok: true,
      items: enriquecidos,
      total_costo_mxn: totalCosto,
      generado_at: new Date().toISOString(),
      criticos_omitidos: Math.max(0, criticos.length - 80),
    })
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Error IA',
    }, { status: 500 })
  }
}
