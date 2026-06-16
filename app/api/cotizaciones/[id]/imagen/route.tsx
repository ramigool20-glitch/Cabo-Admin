/**
 * Genera la imagen PNG profesional de una cotización.
 *
 * Cada negocio tiene un branding distinto (color primario, secundario,
 * emoji decorativo). Usa next/og que renderiza JSX a PNG vía Vercel.
 *
 * URL: GET /api/cotizaciones/[id]/imagen
 * Tamaño: 1080x1528 (formato A4 vertical en proporción móvil-friendly)
 */

import { ImageResponse } from 'next/og'
import { createAdminClient } from '@/lib/supabase/admin'
import { temaDeNegocio, type NegocioBranding, type CotizacionItem } from '@/lib/cotizaciones/tipos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WIDTH = 1080
const HEIGHT = 1528

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: cot } = await admin
    .from('cotizaciones')
    .select('*')
    .eq('id', id)
    .single()
  if (!cot) {
    return new Response('No encontrada', { status: 404 })
  }

  const { data: neg } = await admin
    .from('negocios')
    .select('id, nombre, tipo, slogan, rfc, direccion, telefono, email, url, color_primario, color_secundario')
    .eq('id', cot.negocio_id as string)
    .single()

  const negocio = (neg ?? { id: '', nombre: 'Cabo Admin', tipo: 'general' }) as NegocioBranding
  const tema = temaDeNegocio(negocio)
  const items = (cot.items as CotizacionItem[] | null) ?? []

  const fechaCreado = new Date(cot.created_at as string)
  const fechaVigencia = new Date(fechaCreado.getTime() + Number(cot.vigencia_dias ?? 15) * 86_400_000)
  const fmtFecha = (d: Date) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
  const fmtMoney = (n: number) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          background: '#0a0a0a',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#e4e4e7',
        }}
      >
        {/* Banda superior con gradiente del negocio */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '48px 60px 40px',
            background: `linear-gradient(135deg, ${tema.gradient.from} 0%, ${tema.gradient.to} 100%)`,
            color: 'white',
            position: 'relative',
          }}
        >
          {/* Decoración */}
          <div style={{ position: 'absolute', top: 30, right: 50, fontSize: 180, opacity: 0.12, color: 'white' }}>
            {tema.decoracion}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div
              style={{
                width: 88, height: 88, borderRadius: 24,
                background: 'rgba(255,255,255,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 56,
              }}
            >
              {tema.emoji}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-1px', lineHeight: 1 }}>
                {negocio.nombre}
              </div>
              {negocio.slogan && (
                <div style={{ fontSize: 18, opacity: 0.85, marginTop: 6 }}>{negocio.slogan}</div>
              )}
            </div>
          </div>

          {/* Datos de la cotización en la banda */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 36 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 14, opacity: 0.75, letterSpacing: '3px', textTransform: 'uppercase', fontWeight: 700 }}>
                Cotización
              </div>
              <div style={{ fontSize: 30, fontWeight: 900, marginTop: 4, fontFamily: 'monospace' }}>
                {cot.folio as string}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{ fontSize: 14, opacity: 0.85 }}>{fmtFecha(fechaCreado)}</div>
              <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>
                Vigencia: {fmtFecha(fechaVigencia)}
              </div>
            </div>
          </div>
        </div>

        {/* Cuerpo */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '40px 60px', flex: 1, background: '#0a0a0a' }}>
          {/* Cliente */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '20px 24px',
              borderRadius: 16,
              border: `1px solid ${tema.primary}40`,
              background: `${tema.primary}08`,
              marginBottom: 24,
            }}
          >
            <div style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700 }}>
              Para
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: 'white', marginTop: 4, lineHeight: 1.1 }}>
              {cot.cliente_nombre as string}
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 8, fontSize: 13, color: '#a1a1aa', flexWrap: 'wrap' }}>
              {cot.cliente_email ? <div style={{ display: 'flex' }}>✉ {cot.cliente_email as string}</div> : null}
              {cot.cliente_telefono ? <div style={{ display: 'flex' }}>📞 {cot.cliente_telefono as string}</div> : null}
              {cot.cliente_rfc ? <div style={{ display: 'flex', fontFamily: 'monospace' }}>RFC: {cot.cliente_rfc as string}</div> : null}
            </div>
            {cot.cliente_direccion ? (
              <div style={{ fontSize: 12, color: '#71717a', marginTop: 4 }}>{cot.cliente_direccion as string}</div>
            ) : null}
          </div>

          {/* Tabla de items */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden', border: '1px solid #27272a' }}>
            {/* Header tabla */}
            <div
              style={{
                display: 'flex',
                padding: '12px 16px',
                background: '#18181b',
                borderBottom: `2px solid ${tema.primary}`,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                color: '#a1a1aa',
              }}
            >
              <div style={{ width: 40 }}>#</div>
              <div style={{ flex: 1 }}>Producto</div>
              <div style={{ width: 80, textAlign: 'right' }}>Cant.</div>
              <div style={{ width: 140, textAlign: 'right' }}>P. Unit.</div>
              <div style={{ width: 160, textAlign: 'right' }}>Subtotal</div>
            </div>
            {/* Rows */}
            {items.slice(0, 12).map((it, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  padding: '14px 16px',
                  fontSize: 14,
                  background: idx % 2 === 0 ? '#0a0a0a' : '#111113',
                  borderBottom: idx === Math.min(items.length, 12) - 1 ? 'none' : '1px solid #1f1f23',
                }}
              >
                <div style={{ width: 40, color: '#52525b' }}>{idx + 1}</div>
                <div style={{ flex: 1, color: 'white', fontWeight: 600 }}>{it.nombre}</div>
                <div style={{ width: 80, textAlign: 'right', color: '#d4d4d8', fontVariantNumeric: 'tabular-nums' }}>{it.cantidad}</div>
                <div style={{ width: 140, textAlign: 'right', color: '#a1a1aa', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(it.precio_unitario_mxn)}</div>
                <div style={{ width: 160, textAlign: 'right', color: tema.primary, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(it.subtotal_mxn)}</div>
              </div>
            ))}
            {items.length > 12 && (
              <div style={{ display: 'flex', padding: '10px 16px', fontSize: 11, color: '#71717a', background: '#0a0a0a', fontStyle: 'italic' }}>
                + {items.length - 12} productos más en cotización
              </div>
            )}
          </div>

          {/* Totales */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', width: 380 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, color: '#a1a1aa' }}>
                <span>Subtotal</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(Number(cot.subtotal_mxn ?? 0))}</span>
              </div>
              {Number(cot.descuento_mxn ?? 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, color: '#fca5a5' }}>
                  <span>Descuento ({Number(cot.descuento_pct ?? 0)}%)</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>-{fmtMoney(Number(cot.descuento_mxn))}</span>
                </div>
              )}
              {Number(cot.iva_mxn ?? 0) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, color: '#fcd34d' }}>
                  <span>IVA 16%</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(Number(cot.iva_mxn))}</span>
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  marginTop: 8,
                  borderRadius: 14,
                  background: `linear-gradient(135deg, ${tema.gradient.from}, ${tema.gradient.to})`,
                  color: 'white',
                }}
              >
                <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' }}>Total</span>
                <span style={{ fontSize: 30, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(Number(cot.total_mxn ?? 0))}</span>
              </div>
            </div>
          </div>

          {/* Notas */}
          {cot.notas ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '14px 18px',
                borderRadius: 12,
                background: '#18181b',
                border: '1px solid #27272a',
                marginTop: 20,
              }}
            >
              <div style={{ fontSize: 10, color: '#71717a', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700, marginBottom: 4 }}>
                Notas
              </div>
              <div style={{ fontSize: 13, color: '#d4d4d8', lineHeight: 1.4 }}>{cot.notas as string}</div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '20px 60px 28px',
            background: '#000',
            borderTop: `3px solid ${tema.primary}`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 11, color: '#71717a', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 700 }}>
                {negocio.nombre}
              </div>
              <div style={{ fontSize: 11, color: '#52525b', marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {negocio.rfc && <span>RFC: {negocio.rfc}</span>}
                {negocio.telefono && <span>📞 {negocio.telefono}</span>}
                {negocio.email && <span>✉ {negocio.email}</span>}
                {negocio.url && <span>🌐 {negocio.url.replace(/^https?:\/\//, '')}</span>}
              </div>
              {negocio.direccion && (
                <div style={{ fontSize: 10, color: '#3f3f46', marginTop: 4 }}>{negocio.direccion}</div>
              )}
            </div>
            <div style={{ fontSize: 10, color: '#3f3f46', textAlign: 'right' }}>
              Generado por Cabo Admin
            </div>
          </div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  )
}
