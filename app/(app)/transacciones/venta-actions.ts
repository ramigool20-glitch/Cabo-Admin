'use server'


import { requireOwner } from '@/lib/auth/require-owner'
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
  clave_idempotencia: z.string().min(8).max(150),
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
  await requireOwner()
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
  let rateUsado = 1
  if (monedaCobro === 'USD') {
    // Tomamos el rate como (USD recibido) = (MXN total / rate)
    // Usamos rate_compra del día como referencia para la conversión inversa
    const fxRef = await aMxnEquivalente(1, 'USD', d.fecha)
    rateUsado = Number(fxRef.tipo_cambio_usado ?? 17)
    montoTx = Number((tot.subtotal / rateUsado).toFixed(2))
  } else {
    const fx = await aMxnEquivalente(tot.subtotal, 'MXN', d.fecha)
    rateUsado = Number(fx.tipo_cambio_usado ?? 1)
  }

  const conceptoFinal = d.concepto ?? (d.cliente_nombre ? `Venta a ${d.cliente_nombre}` : `Venta de ${itemsCalculados.length} productos`)
  const { data: resultado, error: txErr } = await admin.rpc('registrar_venta_atomica', { p: {
    usuario_id: user.id, clave_idempotencia: d.clave_idempotencia,
    solicitud: d, fecha: d.fecha, negocio_id: d.negocio_id, cuenta_id: d.cuenta_id,
    metodo_pago: d.metodo_pago, concepto: conceptoFinal, notas: d.notas,
    moneda: monedaCobro, tasa: rateUsado, descontar_stock: d.descontar_stock,
    items: itemsCalculados,
  } })
  if (txErr || !resultado?.id) return { error: txErr?.message ?? 'No se pudo registrar la venta completa' }
  if (resultado.anulada) return { error: 'Este ticket ya fue anulado. Abre uno nuevo para registrar otra venta.' }
  const txId = resultado.id as string

  revalidatePath('/transacciones')
  revalidatePath('/dashboard')
  revalidatePath('/inventario')
  revalidatePath('/pos')

  // 🔔 Notificación push a admin/socio cuando venta viene del POS
  // (no_redirect=true significa que es desde el POS, no formulario manual)
  if (d.no_redirect && !resultado.repetida) {
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
  if (d.no_redirect) return { ok: true, id: txId }
  redirect(`/transacciones/${txId}`)
}
