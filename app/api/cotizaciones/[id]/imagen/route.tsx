/**
 * Genera la imagen PNG profesional de una cotización (estilo Stripe/Square).
 *
 * Versión simplificada — sin qrcode lib ni emojis para asegurar renderizado
 * estable en next/og runtime nodejs. El branding por negocio se hace con
 * solo colores + nombre + decoración tipográfica.
 */

import { ImageResponse } from 'next/og'
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
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const admin = createAdminClient()

    const { data: cot, error: cotErr } = await admin
      .from('cotizaciones')
      .select('*')
      .eq('id', id)
      .single()
    if (cotErr || !cot) {
      return new Response(`No encontrada: ${cotErr?.message ?? 'sin datos'}`, { status: 404 })
    }

    let neg: Record<string, unknown> | null = null
    if (cot.negocio_id) {
      const colsExt = 'id, nombre, tipo, slogan, rfc, direccion, telefono, email, url, color_primario, color_secundario'
      const r1 = await admin.from('negocios').select(colsExt).eq('id', cot.negocio_id as string).maybeSingle()
      if (r1.error) {
        const r2 = await admin.from('negocios').select('id, nombre, tipo').eq('id', cot.negocio_id as string).maybeSingle()
        neg = r2.data
      } else {
        neg = r1.data
      }
    }

    const negocio = (neg ?? { id: '', nombre: 'Cabo Admin', tipo: 'general' }) as unknown as NegocioBranding
    const tema = temaDeNegocio(negocio)
    const items = (cot.items as CotizacionItem[] | null) ?? []

    const fechaCreado = new Date(cot.created_at as string)
    const fechaVigencia = new Date(fechaCreado.getTime() + Number(cot.vigencia_dias ?? 15) * 86_400_000)
    const fmtFechaLarga = (d: Date) => d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
    const fmtMoney = (n: number) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    return new ImageResponse(
      (
        <div
          style={{
            width: WIDTH,
            height: HEIGHT,
            display: 'flex',
            flexDirection: 'column',
            background: '#ffffff',
            fontFamily: 'system-ui',
            color: '#0a0a0a',
          }}
        >
          {/* Banda superior gradiente del negocio */}
          <div
            style={{
              display: 'flex',
              height: 16,
              background: `linear-gradient(90deg, ${tema.gradient.from}, ${tema.gradient.to})`,
            }}
          />

          {/* Logo + nombre del negocio */}
          <div style={{ display: 'flex', alignItems: 'center', padding: '40px 60px 0', gap: 18 }}>
            <div
              style={{
                display: 'flex',
                width: 64,
                height: 64,
                borderRadius: 14,
                background: `linear-gradient(135deg, ${tema.gradient.from}, ${tema.gradient.to})`,
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 30,
                fontWeight: 900,
              }}
            >
              {iniciales(negocio.nombre)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#0a0a0a', letterSpacing: '-0.5px' }}>
                {negocio.nombre}
              </div>
              {negocio.slogan ? (
                <div style={{ display: 'flex', fontSize: 14, color: '#71717a', marginTop: 4 }}>{negocio.slogan}</div>
              ) : null}
            </div>
          </div>

          {/* Título "Cotización" */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 60px 28px' }}>
            <div style={{ fontSize: 46, fontWeight: 800, color: '#0a0a0a', letterSpacing: '-1.5px', lineHeight: 1 }}>
              Cotización
            </div>
            <div style={{ display: 'flex', fontSize: 16, color: '#71717a', marginTop: 14 }}>
              Vigente al {fmtFechaLarga(fechaVigencia)}
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 18,
                padding: '6px 18px',
                borderRadius: 999,
                background: '#f4f4f5',
                fontSize: 14,
                fontWeight: 700,
                color: '#3f3f46',
                letterSpacing: '1px',
              }}
            >
              {cot.folio as string}
            </div>
          </div>

          {/* Cliente con avatar de iniciales */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              margin: '0 60px',
              padding: '24px 0',
              borderTop: '1px solid #e4e4e7',
              borderBottom: '1px solid #e4e4e7',
              gap: 18,
            }}
          >
            <div
              style={{
                display: 'flex',
                width: 64,
                height: 64,
                borderRadius: 999,
                background: '#e4e4e7',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#3f3f46',
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              {iniciales((cot.cliente_nombre as string) || '?')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 13, color: '#71717a', letterSpacing: '1px' }}>PARA</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#0a0a0a', lineHeight: 1.1, marginTop: 2 }}>
                {cot.cliente_nombre as string}
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 13, color: '#71717a', marginTop: 6 }}>
                {cot.cliente_email ? <span>{cot.cliente_email as string}</span> : <span>—</span>}
                {cot.cliente_telefono ? <span>{cot.cliente_telefono as string}</span> : null}
              </div>
            </div>
          </div>

          {/* Detalle de items */}
          <div style={{ display: 'flex', flexDirection: 'column', padding: '24px 60px 0', flex: 1 }}>
            <div style={{ display: 'flex', fontSize: 13, color: '#71717a', letterSpacing: '1px', marginBottom: 14 }}>DETALLE</div>

            {items.slice(0, 10).map((it, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: idx === Math.min(items.length, 10) - 1 ? 'none' : '1px solid #f4f4f5',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingRight: 16 }}>
                  <div style={{ fontSize: 16, fontWeight: 500, color: '#0a0a0a' }}>{it.nombre}</div>
                  <div style={{ display: 'flex', fontSize: 12, color: '#71717a', marginTop: 4 }}>
                    {it.cantidad} × {fmtMoney(it.precio_unitario_mxn)}
                  </div>
                </div>
                <div style={{ display: 'flex', fontSize: 16, fontWeight: 600, color: '#0a0a0a' }}>
                  {fmtMoney(it.subtotal_mxn)}
                </div>
              </div>
            ))}

            {items.length > 10 ? (
              <div style={{ display: 'flex', padding: '10px 0', fontSize: 13, color: '#71717a' }}>
                + {items.length - 10} productos más
              </div>
            ) : null}

            {/* Totales */}
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 15, color: '#52525b' }}>
                <span>Subtotal</span>
                <span>{fmtMoney(Number(cot.subtotal_mxn ?? 0))}</span>
              </div>
              {Number(cot.descuento_mxn ?? 0) > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 15, color: '#16a34a' }}>
                  <span>Descuento ({Number(cot.descuento_pct ?? 0)}%)</span>
                  <span>-{fmtMoney(Number(cot.descuento_mxn ?? 0))}</span>
                </div>
              ) : null}
              {Number(cot.iva_mxn ?? 0) > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 15, color: '#52525b' }}>
                  <span>IVA 16%</span>
                  <span>{fmtMoney(Number(cot.iva_mxn ?? 0))}</span>
                </div>
              ) : null}
            </div>

            {/* Total con línea negra */}
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 18 }}>
              <div style={{ display: 'flex', height: 3, background: '#0a0a0a', marginBottom: 18 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: '#0a0a0a' }}>Total</span>
                <span style={{ fontSize: 42, fontWeight: 800, color: tema.primary, letterSpacing: '-1px' }}>
                  {fmtMoney(Number(cot.total_mxn ?? 0))}
                </span>
              </div>
            </div>

            {cot.notas ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '16px 20px',
                  marginTop: 28,
                  borderRadius: 12,
                  background: '#fef9c3',
                  border: '1px solid #fde68a',
                }}
              >
                <div style={{ display: 'flex', fontSize: 12, color: '#854d0e', letterSpacing: '1.5px', fontWeight: 700, marginBottom: 6 }}>
                  NOTAS
                </div>
                <div style={{ display: 'flex', fontSize: 14, color: '#3f3f46' }}>{cot.notas as string}</div>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '24px 60px 32px',
              borderTop: '1px solid #e4e4e7',
              background: '#fafafa',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0a0a0a' }}>{negocio.nombre}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#71717a', marginTop: 6 }}>
                  {negocio.rfc ? <span>RFC: {negocio.rfc}</span> : null}
                  {negocio.telefono ? <span>{negocio.telefono}</span> : null}
                  {negocio.email ? <span>{negocio.email}</span> : null}
                </div>
              </div>
              <div style={{ display: 'flex', fontSize: 10, color: '#a1a1aa', letterSpacing: '0.5px' }}>
                Cabo Admin
              </div>
            </div>
          </div>
        </div>
      ),
      { width: WIDTH, height: HEIGHT },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    console.error('[cotizaciones/imagen] ERROR:', msg, e)
    return new Response(`Error: ${msg}`, { status: 500 })
  }
}
