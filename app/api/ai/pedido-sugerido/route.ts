/**
 * Genera un pedido sugerido.
 *
 * V1 (actual): Algoritmo determinístico — sin IA. Razones:
 *   - El usuario apenas empieza a registrar ventas (no hay POS aún), así que
 *     la IA no aporta valor sobre las reglas hasta tener histórico real.
 *   - Determinístico = instantáneo (<200ms) y sin riesgo de timeout 504.
 *   - 100% predecible y depurable.
 *
 * V2 (cuando haya >=30 días de ventas reales por POS): refinar con Claude
 *   Sonnet para detectar estacionalidad, productos complementarios y
 *   sugerencias estratégicas (descontinuar slow-movers, mover Choco vs OTC).
 *
 * Reglas V1:
 *   - Agotado + se vendió en 30d  → ALTA, cantidad = max(ventas_30d, 6)
 *   - Agotado + sin movimiento    → BAJA, cantidad = stock_minimo o 3
 *   - Bajo stock + se vendió      → MEDIA, cantidad = max(ventas_30d-stock, 3)
 *   - Bajo stock + sin movimiento → BAJA, cantidad = stock_minimo*2 - stock
 *   - Precio >$1000 MXN: redondea conservador (cap 5 unidades)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

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

  // 1. Productos activos
  const { data: rows, error: prodErr } = await admin
    .from('inventario_productos')
    .select('id, nombre, categoria, codigo_barras, precio_mxn, stock, stock_minimo')
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

  // 2. Movimientos de venta/salida últimos 30d → velocidad por producto
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

  // 3. Aplicar reglas
  const items: ItemPedido[] = []
  let totalCosto = 0

  for (const p of criticos) {
    const stock = Number(p.stock ?? 0)
    const minimo = Number(p.stock_minimo ?? 3)
    const precio = Number(p.precio_mxn ?? 0)
    const ventas = ventasPorProducto.get(p.id) ?? 0
    const agotado = stock === 0
    const seVendio = ventas > 0

    let cantidad: number
    let prioridad: ItemPedido['prioridad']
    let justificacion: string

    if (agotado && seVendio) {
      cantidad = Math.max(ventas, 6)
      prioridad = 'alta'
      justificacion = `Agotado · vendió ${ventas}u en 30d`
    } else if (agotado && !seVendio) {
      cantidad = Math.max(minimo, 3)
      prioridad = 'baja'
      justificacion = `Agotado · sin ventas recientes`
    } else if (!agotado && seVendio) {
      cantidad = Math.max(ventas - stock, 3)
      prioridad = 'media'
      justificacion = `Bajo stock · vendió ${ventas}u en 30d`
    } else {
      cantidad = Math.max(minimo * 2 - stock, 2)
      prioridad = 'baja'
      justificacion = `Bajo stock · reabasto preventivo`
    }

    // Cap conservador para productos caros
    if (precio > 1000) {
      cantidad = Math.min(cantidad, 5)
    }
    // Cap mínimo razonable para consumibles baratos
    if (precio < 50 && cantidad < 6 && seVendio) {
      cantidad = 6
    }

    cantidad = Math.max(0, Math.round(cantidad))
    const costo = cantidad * precio
    totalCosto += costo

    items.push({
      codigo_barras: p.codigo_barras as string | null,
      nombre: p.nombre as string,
      categoria: (p.categoria as string | null) ?? null,
      stock_actual: stock,
      stock_minimo: minimo,
      ventas_30d: ventas,
      cantidad_sugerida: cantidad,
      prioridad,
      costo_estimado_mxn: costo,
      justificacion,
    })
  }

  // 4. Ordenar por prioridad, luego costo descendente
  const ordenPrioridad = { alta: 0, media: 1, baja: 2 }
  items.sort((a, b) => {
    const p = ordenPrioridad[a.prioridad] - ordenPrioridad[b.prioridad]
    if (p !== 0) return p
    return b.costo_estimado_mxn - a.costo_estimado_mxn
  })

  return NextResponse.json({
    ok: true,
    items,
    total_costo_mxn: totalCosto,
    generado_at: new Date().toISOString(),
    motor: 'reglas_v1',
  })
}
