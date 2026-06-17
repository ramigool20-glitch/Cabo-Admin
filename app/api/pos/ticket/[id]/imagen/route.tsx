/**
 * Genera el ticket de venta PNG (estilo térmico 58mm/80mm).
 * Reusa el patrón de cotizaciones pero formato angosto vertical.
 *
 * Tamaño: 720×variable (proporción ticket impresora)
 */

import { ImageResponse } from 'next/og'
import QRCode from 'qrcode'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WIDTH = 720

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const admin = createAdminClient()

    // Carga transacción
    const { data: tx, error: txErr } = await admin
      .from('transacciones')
      .select('id, fecha, monto, metodo_pago, concepto, negocio_id, cuenta_id, created_at, notas')
      .eq('id', id)
      .single()
    if (txErr || !tx) {
      return new Response(`No encontrada: ${txErr?.message ?? 'sin datos'}`, { status: 404 })
    }

    // Carga items de la venta
    const { data: itemsData } = await admin
      .from('venta_items')
      .select('nombre_snapshot, codigo_barras_snapshot, cantidad, precio_unitario_mxn, subtotal_mxn')
      .eq('transaccion_id', id)
      .order('created_at')
    const items = (itemsData ?? []) as Array<{
      nombre_snapshot: string
      codigo_barras_snapshot: string | null
      cantidad: number
      precio_unitario_mxn: number
      subtotal_mxn: number
    }>

    // Carga negocio
    const { data: neg } = await admin
      .from('negocios')
      .select('nombre, telefono, direccion')
      .eq('id', tx.negocio_id as string)
      .maybeSingle()
    const negocio = (neg ?? { nombre: 'CVU Pharmacy' }) as { nombre: string; telefono?: string | null; direccion?: string | null }

    // QR con folio (link al detalle)
    const origin = new URL(req.url).origin
    let qrDataUrl: string | null = null
    try {
      qrDataUrl = await QRCode.toDataURL(`${origin}/transacciones/${id}`, {
        margin: 0,
        width: 140,
        color: { dark: '#0a0a0a', light: '#ffffff' },
      })
    } catch { /* sigue sin QR */ }

    // Helpers
    const fmtMoney = (n: number) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    const fecha = new Date(tx.created_at as string)
    const folio = String(tx.id as string).slice(0, 8).toUpperCase()

    // Altura adaptativa según items
    const HEIGHT = 600 + items.length * 50

    // Etiqueta legible del método de pago
    const metodoLabel = (() => {
      const m = String(tx.metodo_pago ?? '').toLowerCase()
      if (m.includes('efectivo')) return 'Efectivo'
      if (m.includes('mp')) return 'Mercado Pago'
      if (m === 'tarjeta') return 'Tarjeta'
      if (m.includes('stripe')) return 'Tarjeta (Stripe)'
      if (m.includes('transferencia')) return 'Transferencia'
      return m || 'Otro'
    })()

    return new ImageResponse(
      (
        <div
          style={{
            width: WIDTH,
            height: HEIGHT,
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff',
            fontFamily: 'monospace, "Courier New"',
            color: '#0a0a0a',
            padding: '40px 32px',
          }}
        >
          {/* Header negocio */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.5px', color: '#0a0a0a' }}>
              {negocio.nombre}
            </div>
            {negocio.direccion && (
              <div style={{ fontSize: 13, color: '#52525b', marginTop: 4 }}>{negocio.direccion}</div>
            )}
            {negocio.telefono && (
              <div style={{ fontSize: 13, color: '#52525b' }}>Tel: {negocio.telefono}</div>
            )}
          </div>

          {/* Separator */}
          <div style={{ display: 'flex', borderTop: '2px dashed #a1a1aa', marginBottom: 12 }} />

          {/* Folio + Fecha */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#52525b', marginBottom: 4 }}>
            <span>Folio:</span>
            <span style={{ fontWeight: 700, color: '#0a0a0a' }}>#{folio}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#52525b', marginBottom: 16 }}>
            <span>Fecha:</span>
            <span>{fecha.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          {/* Items */}
          <div style={{ display: 'flex', flexDirection: 'column', borderTop: '2px dashed #a1a1aa', borderBottom: '2px dashed #a1a1aa', padding: '12px 0', marginBottom: 12 }}>
            {items.map((it, idx) => (
              <div key={idx} style={{ display: 'flex', flexDirection: 'column', marginBottom: idx === items.length - 1 ? 0 : 10 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0a0a0a' }}>{it.nombre_snapshot}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#52525b', marginTop: 2 }}>
                  <span>{it.cantidad} × {fmtMoney(it.precio_unitario_mxn)}</span>
                  <span style={{ fontWeight: 700, color: '#0a0a0a' }}>{fmtMoney(it.subtotal_mxn)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Total destacado */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#0a0a0a' }}>TOTAL</span>
            <span style={{ fontSize: 32, fontWeight: 900, color: '#0a0a0a' }}>{fmtMoney(Number(tx.monto ?? 0))}</span>
          </div>

          {/* Método de pago */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#52525b', marginBottom: 4 }}>
            <span>Pago:</span>
            <span style={{ fontWeight: 700, color: '#0a0a0a' }}>{metodoLabel}</span>
          </div>
          {tx.notas && (
            <div style={{ display: 'flex', fontSize: 12, color: '#71717a', marginBottom: 16 }}>
              {tx.notas as string}
            </div>
          )}

          {/* Separator + QR + agradecimiento */}
          <div style={{ display: 'flex', borderTop: '2px dashed #a1a1aa', marginTop: 'auto', paddingTop: 16, flexDirection: 'column', alignItems: 'center' }}>
            {qrDataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={qrDataUrl} width={100} height={100} alt="QR" style={{ marginBottom: 8 }} />
            )}
            <div style={{ display: 'flex', fontSize: 14, fontWeight: 700, color: '#0a0a0a' }}>
              ¡Gracias por su compra!
            </div>
            <div style={{ display: 'flex', fontSize: 10, color: '#a1a1aa', marginTop: 4 }}>
              Cabo Admin
            </div>
          </div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT, emoji: 'twemoji' },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    console.error('[pos/ticket/imagen] ERROR:', msg, e)
    return new Response(`Error generando ticket: ${msg}`, { status: 500 })
  }
}
