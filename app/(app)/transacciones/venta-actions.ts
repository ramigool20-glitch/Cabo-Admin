'use server'

/**
 * Server action para registrar una VENTA con items del inventario.
 *
 * Flujo:
 *   1. Inserta transacción tipo 'ingreso' con monto = total
 *   2. Por cada item: inserta venta_items con SNAPSHOT del costo actual
 *      del producto (no cambia si después editas el costo en inventario)
 *   3. Por cada item: inserta inventario_movimientos (tipo='venta', neg)
 *   4. Por cada item: descuenta stock del producto
 *   5. El TRIGGER en BD calcula ganancia_estimada_mxn automáticamente
 *
 * NO modifica el flujo de createTransaccion existente.
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { aMxnEquivalente } from '@/lib/fx/server'
import { calcularItem, calcularTotalesVenta } from '@/lib/ventas/items'
import { enviarPushAProfiles } from '@/lib/push/server'
import { logError, logFatal } from '@/lib/logger/server'

export type VentaActionState = { ok?: boolean; error?: string; id?: string }

const ItemSchema = z.object({
  producto_id: z.string().uuid().nullable(),
  nombre_snapshot: z.string().min(1).max(200),
  codigo_barras_snapshot: z.string().max(60).nullable().optional(),
  categoria_snapshot: z.string().max(60).nullable().optional(),
  costo_unitario_snapshot_mxn: z.coerce.number().min(0).nullable(),
  cantidad: z.coerce.number().positive(),
  precio_unitario_mxn: z.coerce.number().min(0),
  descuento_pct: z.coerce.number().min(0).max(100).default(0),
})

const VentaSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  negocio_id: z.string().uuid(),
  cuenta_id: z.string().uuid(),
  metodo_pago: z.string().max(40).optional().nullable(),
  concepto: z.string().max(500).optional().nullable(),
  cliente_nombre: z.string().max(200).optional().nullable(),
  notas: z.string().max(1000).optional().nullable(),
  items: z.array(ItemSchema).min(1).max(100),
  descuento_global_pct: z.coerce.number().min(0).max(100).default(0),
  descontar_stock: z.boolean().default(true),
  // POS: no redirige al detalle, devuelve id para mostrar éxito inline
  no_redirect: z.boolean().optional(),
  // Moneda del COBRO (la cajera recibió USD aunque productos están en MXN).
  // Default MXN. Si es USD, convierte el total MXN a USD usando el rate del día.
  moneda_cobro: z.enum(['MXN', 'USD']).optional(),
})

export async function crearVentaConItems(input: z.infer<typeof VentaSchema>): Promise<VentaActionState> {
  const parsed = VentaSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()
  const d = parsed.data

  // 1. Aplicar descuento global proporcionalmente a cada item
  //    (multiplica el descuento_pct individual de cada item).
  //    Si item ya tenía 10% y global es 5%, queda 14.5% combinado (1 - 0.9 * 0.95)
  const itemsCalculados = d.items.map(i => {
    const factor = 1 - ((1 - i.descuento_pct / 100) * (1 - d.descuento_global_pct / 100))
    const descPctFinal = Math.min(100, factor * 100)
    return calcularItem({
      producto_id: i.producto_id,
      nombre_snapshot: i.nombre_snapshot,
      codigo_barras_snapshot: i.codigo_barras_snapshot ?? null,
      categoria_snapshot: i.categoria_snapshot ?? null,
      costo_unitario_snapshot_mxn: i.costo_unitario_snapshot_mxn,
      cantidad: i.cantidad,
      precio_unitario_mxn: i.precio_unitario_mxn,
      descuento_pct: descPctFinal,
    })
  })

  const tot = calcularTotalesVenta(itemsCalculados)

  if (tot.subtotal <= 0) return { error: 'El total de la venta debe ser mayor a 0' }

  // 2. FX — si cobraste en USD, conviertes el total MXN a USD del día
  const monedaCobro = d.moneda_cobro ?? 'MXN'
  let montoTx = tot.subtotal
  let montoMxnEquiv = tot.subtotal
  let rateUsado = 1
  if (monedaCobro === 'USD') {
    // Tomamos el rate como (USD recibido) = (MXN total / rate)
    // Usamos rate_compra del día como referencia para la conversión inversa
    const fxRef = await aMxnEquivalente(1, 'USD', d.fecha)
    rateUsado = Number(fxRef.tipo_cambio_usado ?? 17)
    montoTx = Number((tot.subtotal / rateUsado).toFixed(2))
    montoMxnEquiv = tot.subtotal  // el valor real del producto vendido en MXN
  } else {
    const fx = await aMxnEquivalente(tot.subtotal, 'MXN', d.fecha)
    rateUsado = Number(fx.tipo_cambio_usado ?? 1)
    montoMxnEquiv = fx.monto_mxn_equivalente
  }

  // 3. Insert transacción
  const conceptoFinal = d.concepto ?? (d.cliente_nombre
    ? `Venta a ${d.cliente_nombre}`
    : `Venta de ${itemsCalculados.length} producto${itemsCalculados.length === 1 ? '' : 's'}`)

  const { data: nuevaTx, error: txErr } = await admin
    .from('transacciones')
    .insert({
      tipo: 'ingreso',
      monto: montoTx,
      moneda: monedaCobro,
      monto_mxn_equivalente: montoMxnEquiv,
      tipo_cambio_usado: rateUsado,
      fecha: d.fecha,
      negocio_id: d.negocio_id,
      cuenta_id: d.cuenta_id,
      metodo_pago: d.metodo_pago ?? null,
      categoria: 'Venta de productos',
      concepto: conceptoFinal,
      notas: d.notas ?? null,
      metodo_captura: 'manual',
      capturado_por: user.id,
    })
    .select('id')
    .single()

  if (txErr || !nuevaTx) {
    await logFatal('venta-actions/crearVentaConItems', txErr ?? 'No se creó la transacción', {
      user_id: user.id, monedaCobro, monto: tot.subtotal, items_count: itemsCalculados.length,
    })
    return { error: txErr?.message ?? 'No se creó la transacción' }
  }
  const txId = nuevaTx.id as string

  // 4. Insert venta_items uno por uno (el trigger recalcula la TX en BD)
  for (const it of itemsCalculados) {
    const { error: viErr } = await admin
      .from('venta_items')
      .insert({
        transaccion_id: txId,
        producto_id: it.producto_id,
        nombre_snapshot: it.nombre_snapshot,
        codigo_barras_snapshot: it.codigo_barras_snapshot ?? null,
        categoria_snapshot: it.categoria_snapshot ?? null,
        costo_unitario_snapshot_mxn: it.costo_unitario_snapshot_mxn,
        cantidad: it.cantidad,
        precio_unitario_mxn: it.precio_unitario_mxn,
        descuento_pct: it.descuento_pct,
        descuento_mxn: it.descuento_mxn,
        subtotal_mxn: it.subtotal_mxn,
        ganancia_mxn: it.ganancia_mxn,
      })
    if (viErr) {
      // Si falla, dejamos la transacción huérfana en lugar de revertir
      // (la app es defensive con tiene_items=false hasta que el trigger corra)
      await logError('venta-actions/insertVentaItem', viErr, {
        user_id: user.id, txId, producto_id: it.producto_id, cantidad: it.cantidad,
      })
      return { error: 'Item: ' + viErr.message, id: txId }
    }

    // 5. Movimiento de inventario + descuento de stock (best-effort)
    if (it.producto_id && d.descontar_stock) {
      const { data: prod } = await admin
        .from('inventario_productos')
        .select('stock')
        .eq('id', it.producto_id)
        .single()
      const stockActual = Number(prod?.stock ?? 0)
      const stockNuevo = Math.max(0, stockActual - it.cantidad)

      await admin.from('inventario_movimientos').insert({
        producto_id: it.producto_id,
        tipo: 'venta',
        cantidad: -Math.abs(it.cantidad),
        precio_unitario: it.precio_unitario_mxn,
        motivo: `Venta ${conceptoFinal}`,
        creado_por: user.id,
      })
      await admin
        .from('inventario_productos')
        .update({ stock: stockNuevo })
        .eq('id', it.producto_id)
    }
  }

  revalidatePath('/transacciones')
  revalidatePath('/dashboard')
  revalidatePath('/inventario')
  revalidatePath('/pos')

  // 🔔 Notificación push a admin/socio cuando venta viene del POS
  // (no_redirect=true significa que es desde el POS, no formulario manual)
  if (d.no_redirect) {
    try {
      const { data: admins } = await admin
        .from('profiles')
        .select('id, roles(nombre)')
        .eq('activo', true)
      const adminIds = (admins ?? [])
        .filter(p => {
          const r = (p.roles as unknown as { nombre: string } | null)?.nombre
          return r === 'admin' || r === 'socio'
        })
        .map(p => p.id as string)
        .filter(id => id !== user.id)  // No te notifiques a ti mismo si cobraste tú

      if (adminIds.length > 0) {
        const { data: cajeraProf } = await admin
          .from('profiles').select('nombre').eq('id', user.id).single()
        const nombreCajera = (cajeraProf?.nombre as string) ?? 'Cajera'
        const fmtMonto = monedaCobro === 'USD'
          ? `🇺🇸 $${montoTx.toFixed(2)} USD`
          : `$${montoTx.toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`

        await enviarPushAProfiles(adminIds, {
          title: '💰 Nueva venta en CVU',
          body: `${nombreCajera} cobró ${fmtMonto} (${itemsCalculados.length} producto${itemsCalculados.length === 1 ? '' : 's'})`,
          url: `/transacciones/${txId}`,
          tag: `venta-pos-${txId}`,
        })
      }
    } catch {
      // Silent fail - la venta ya está registrada, push no es crítico
    }

    return { ok: true, id: txId }
  }
  redirect(`/transacciones/${txId}`)
}
