/**
 * Genera la imagen PNG profesional de una cotización.
 *
 * Estilo "luxury clean" tipo Stripe/Square: fondo blanco, tipografía
 * oscura limpia, color de acento del negocio solo en banda superior,
 * total destacado, y separadores grises. Incluye QR code con el link
 * a la cotización para verificación rápida.
 *
 * URL: GET /api/cotizaciones/[id]/imagen
 * Tamaño: 1080×1700 (proporción papel + extras)
 */

import { ImageResponse } from 'next/og'
import QRCode from 'qrcode'
import { createAdminClient } from '@/lib/supabase/admin'
import { temaDeNegocio, type NegocioBranding, type CotizacionItem } from '@/lib/cotizaciones/tipos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WIDTH = 1080
const HEIGHT = 1700

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('')
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: cot } = await admin
    .from('cotizaciones')
    .select('*')
    .eq('id', id)
    .single()
  if (!cot) return new Response('No encontrada', { status: 404 })

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
  const mesNombre = (d: Date) => d.toLocaleDateString('es-MX', { month: 'short' }).toUpperCase().replace('.', '')
  const fmtFechaLarga = (d: Date) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
  const fmtMoney = (n: number) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // QR code → data URL con link a la cotización
  const origin = new URL(req.url).origin
  const cotUrl = `${origin}/cotizaciones/${id}`
  const qrDataUrl = await QRCode.toDataURL(cotUrl, {
    margin: 0,
    width: 200,
    color: { dark: '#0a0a0a', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })

  return new ImageResponse(
    (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          fontFamily: 'system-ui, -apple-system, "Helvetica Neue", sans-serif',
          color: '#0a0a0a',
        }}
      >
        {/* Banda superior fina con color del negocio */}
        <div
          style={{
            height: 12,
            background: `linear-gradient(90deg, ${tema.gradient.from}, ${tema.gradient.to})`,
            display: 'flex',
          }}
        />

        {/* Logo y nombre del negocio */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '32px 60px 0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 56, height: 56, borderRadius: 14,
                background: `linear-gradient(135deg, ${tema.gradient.from}, ${tema.gradient.to})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 30, color: 'white',
              }}
            >
              {tema.emoji}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#0a0a0a', letterSpacing: '-0.5px' }}>
                {negocio.nombre}
              </div>
              {negocio.slogan && (
                <div style={{ fontSize: 13, color: '#71717a', marginTop: 2 }}>{negocio.slogan}</div>
              )}
            </div>
          </div>
        </div>

        {/* Título principal centrado tipo "Appointment Confirmed" */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '40px 60px 32px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 42, fontWeight: 800, color: '#0a0a0a', letterSpacing: '-1px', lineHeight: 1 }}>
            Cotización
          </div>
          <div style={{ fontSize: 16, color: '#71717a', marginTop: 12 }}>
            Vigente al {fmtFechaLarga(fechaVigencia)}
          </div>
          {/* Folio pill */}
          <div
            style={{
              display: 'flex',
              marginTop: 20,
              padding: '6px 16px',
              borderRadius: 999,
              background: '#f4f4f5',
              fontSize: 13,
              fontWeight: 700,
              color: '#3f3f46',
              letterSpacing: '1px',
              fontFamily: 'ui-monospace, "SF Mono", monospace',
            }}
          >
            {cot.folio as string}
          </div>
        </div>

        {/* Bloque calendario + descripción + QR (3 columnas) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            margin: '0 60px',
            paddingTop: 24,
            paddingBottom: 24,
            gap: 24,
            borderTop: '1px solid #e4e4e7',
            borderBottom: '1px solid #e4e4e7',
          }}
        >
          {/* Fecha cuadrada */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: 90, height: 90,
              border: '1.5px solid #e4e4e7',
              borderRadius: 12,
            }}
          >
            <div style={{ fontSize: 36, fontWeight: 800, color: '#0a0a0a', lineHeight: 1 }}>
              {fechaCreado.getDate()}
            </div>
            <div style={{ fontSize: 11, color: '#71717a', marginTop: 4, letterSpacing: '1px' }}>
              {mesNombre(fechaCreado)}
            </div>
          </div>

          {/* Para quién */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0a0a0a', lineHeight: 1.1 }}>
              Cotización para
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#0a0a0a', lineHeight: 1.1 }}>
              {cot.cliente_nombre as string}
            </div>
            <div style={{ fontSize: 13, color: '#71717a', marginTop: 8 }}>
              Emitida el {fmtFechaLarga(fechaCreado)}
            </div>
          </div>

          {/* QR */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} width={88} height={88} alt="QR" style={{ borderRadius: 6 }} />
            <div style={{ fontSize: 10, color: '#71717a', marginTop: 6, letterSpacing: '0.5px', textDecoration: 'underline' }}>
              Ver online
            </div>
          </div>
        </div>

        {/* Sección Customer */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '24px 60px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: '#71717a', letterSpacing: '0.5px' }}>Cliente</div>
            <div style={{ flex: 1, height: 1, background: '#e4e4e7', display: 'flex' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 48, height: 48, borderRadius: 999,
                background: '#e4e4e7',
                color: '#3f3f46',
                fontSize: 16, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {iniciales((cot.cliente_nombre as string) || '?')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0a0a0a' }}>{cot.cliente_nombre as string}</div>
              <div style={{ display: 'flex', gap: 14, fontSize: 13, color: '#71717a', marginTop: 2 }}>
                {cot.cliente_email && <div style={{ display: 'flex' }}>{cot.cliente_email as string}</div>}
                {cot.cliente_telefono && <div style={{ display: 'flex' }}>· {cot.cliente_telefono as string}</div>}
              </div>
              {cot.cliente_rfc ? (
                <div style={{ fontSize: 12, color: '#71717a', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
                  RFC: {cot.cliente_rfc as string}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '12px 60px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: '#71717a', letterSpacing: '0.5px' }}>Detalle</div>
            <div style={{ flex: 1, height: 1, background: '#e4e4e7', display: 'flex' }} />
          </div>

          {/* Items — máximo 10 antes de truncar */}
          {items.slice(0, 10).map((it, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                padding: '10px 0',
                borderBottom: idx === Math.min(items.length, 10) - 1 ? 'none' : '1px solid #f4f4f5',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 16 }}>
                <div style={{ fontSize: 15, color: '#0a0a0a', fontWeight: 500 }}>
                  {it.nombre}
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 12, color: '#71717a', marginTop: 2 }}>
                  <span>{it.cantidad} × {fmtMoney(it.precio_unitario_mxn)}</span>
                  {it.codigo_barras && <span style={{ fontFamily: 'ui-monospace, monospace' }}>· {it.codigo_barras}</span>}
                </div>
              </div>
              <div style={{ fontSize: 15, color: '#0a0a0a', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                {fmtMoney(it.subtotal_mxn)}
              </div>
            </div>
          ))}
          {items.length > 10 && (
            <div style={{ display: 'flex', padding: '8px 0', fontSize: 12, color: '#71717a', fontStyle: 'italic' }}>
              + {items.length - 10} productos más
            </div>
          )}

          {/* Subtotales */}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, color: '#52525b' }}>
              <span>Subtotal</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(Number(cot.subtotal_mxn ?? 0))}</span>
            </div>
            {Number(cot.descuento_mxn ?? 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, color: '#16a34a' }}>
                <span>Descuento ({Number(cot.descuento_pct ?? 0)}%)</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>-{fmtMoney(Number(cot.descuento_mxn))}</span>
              </div>
            )}
            {Number(cot.iva_mxn ?? 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, color: '#52525b' }}>
                <span>IVA 16%</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(Number(cot.iva_mxn))}</span>
              </div>
            )}
          </div>

          {/* Total con línea negra gruesa */}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14 }}>
            <div style={{ height: 2, background: '#0a0a0a', display: 'flex', marginBottom: 14 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0a0a0a' }}>Total</div>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  color: tema.primary,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-1px',
                }}
              >
                {fmtMoney(Number(cot.total_mxn ?? 0))}
              </div>
            </div>
          </div>

          {/* Notas (si hay) */}
          {cot.notas ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '14px 18px',
                marginTop: 24,
                borderRadius: 10,
                background: '#fef9c3',
                border: '1px solid #fde68a',
              }}
            >
              <div style={{ fontSize: 11, color: '#854d0e', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700, marginBottom: 4 }}>
                Notas
              </div>
              <div style={{ fontSize: 13, color: '#3f3f46', lineHeight: 1.4 }}>{cot.notas as string}</div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '20px 60px 28px',
            borderTop: '1px solid #e4e4e7',
            background: '#fafafa',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0a0a0a' }}>{negocio.nombre}</div>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: '#71717a', marginTop: 4, flexWrap: 'wrap' }}>
                {negocio.rfc && <span>RFC: {negocio.rfc}</span>}
                {negocio.telefono && <span>{negocio.telefono}</span>}
                {negocio.email && <span>{negocio.email}</span>}
                {negocio.url && <span>{negocio.url.replace(/^https?:\/\//, '')}</span>}
              </div>
              {negocio.direccion && (
                <div style={{ fontSize: 10, color: '#a1a1aa', marginTop: 4 }}>{negocio.direccion}</div>
              )}
            </div>
            <div style={{ fontSize: 9, color: '#a1a1aa', letterSpacing: '0.5px' }}>
              Generado por Cabo Admin
            </div>
          </div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  )
}
