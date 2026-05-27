import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, ShoppingBag, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import { VentaQuickForm } from '@/components/negocios/venta-quick-form'
import { EliminarItemBtn } from '@/components/negocios/eliminar-item-btn'

function esCategoriaVenta(categoria: string | null, concepto: string | null): boolean {
  const cat = (categoria ?? '').toLowerCase().trim()
  if (cat === 'ventas' || cat === 'venta') return true
  const con = (concepto ?? '').toLowerCase()
  return /^venta:|^vendido:/.test(con)
}

type VentaItem = {
  id: string
  source: 'transaccion' | 'venta'
  fecha: string
  producto: string | null
  precio_venta: number
  moneda: 'MXN' | 'USD'
  precio_venta_mxn: number
  costo_producto_mxn: number
  created_at: string
}

export default async function VentasPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: negocio } = await supabase
    .from('negocios')
    .select('id, nombre, tipo, moneda_principal')
    .eq('id', id)
    .single()

  if (!negocio) notFound()

  const { data: fxLatest } = await admin
    .from('fx_rates')
    .select('rate_compra')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()
  const fxRate = fxLatest ? Number(fxLatest.rate_compra) : null

  // Trae ventas dedicadas
  const { data: ventas } = await supabase
    .from('ventas')
    .select('id, fecha, producto, precio_venta, moneda, costo_producto, precio_venta_mxn, costo_producto_mxn, tipo_cambio_usado, created_at')
    .eq('negocio_id', id)
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  // Trae transacciones ingreso (para detectar las que sean ventas y no estén en tabla)
  const { data: txs } = await supabase
    .from('transacciones')
    .select('id, tipo, monto, moneda, fecha, categoria, concepto, notas, monto_mxn_equivalente, tipo_cambio_usado, created_at')
    .eq('negocio_id', id)
    .eq('tipo', 'ingreso')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  const list: VentaItem[] = []

  for (const v of ventas ?? []) {
    const monto = Number(v.precio_venta)
    const eqMxn = v.precio_venta_mxn != null
      ? Number(v.precio_venta_mxn)
      : v.moneda === 'MXN' ? monto : (fxRate ? monto * fxRate : 0)
    const costoMxn = v.costo_producto_mxn != null
      ? Number(v.costo_producto_mxn)
      : v.costo_producto && v.moneda === 'MXN' ? Number(v.costo_producto)
      : v.costo_producto && fxRate ? Number(v.costo_producto) * fxRate
      : 0
    list.push({
      id: v.id,
      source: 'venta',
      fecha: v.fecha,
      producto: v.producto,
      precio_venta: monto,
      moneda: v.moneda as 'MXN' | 'USD',
      precio_venta_mxn: eqMxn,
      costo_producto_mxn: costoMxn,
      created_at: v.created_at,
    })
  }

  // Marca tx que ya están ligadas
  const linkedTxIds = new Set<string>()
  for (const t of txs ?? []) {
    if (t.notas && /Sincronizado desde ventas/.test(t.notas)) {
      linkedTxIds.add(t.id)
    }
  }

  // Agrega tx con categoría venta que NO estén ligadas
  for (const t of txs ?? []) {
    if (linkedTxIds.has(t.id)) continue
    if (!esCategoriaVenta(t.categoria, t.concepto)) continue

    const monto = Number(t.monto)
    const eqMxn = t.monto_mxn_equivalente != null
      ? Number(t.monto_mxn_equivalente)
      : t.moneda === 'MXN' ? monto : (fxRate ? monto * fxRate : 0)
    list.push({
      id: t.id,
      source: 'transaccion',
      fecha: t.fecha,
      producto: t.concepto,
      precio_venta: monto,
      moneda: t.moneda as 'MXN' | 'USD',
      precio_venta_mxn: eqMxn,
      costo_producto_mxn: 0,
      created_at: t.created_at,
    })
  }

  list.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at))

  const totalVentasMxn = list.reduce((acc, v) => acc + v.precio_venta_mxn, 0)
  const totalCostoMxn = list.reduce((acc, v) => acc + v.costo_producto_mxn, 0)
  const margenBruto = totalVentasMxn - totalCostoMxn
  const ticketPromedio = list.length ? totalVentasMxn / list.length : 0
  const totalUsdOriginal = list.filter((v) => v.moneda === 'USD').reduce((acc, v) => acc + v.precio_venta, 0)

  const porProducto = list.reduce<Record<string, { count: number; mxn: number }>>((acc, v) => {
    const p = (v.producto || 'Sin producto').toLowerCase().trim()
    if (!acc[p]) acc[p] = { count: 0, mxn: 0 }
    acc[p].count += 1
    acc[p].mxn += v.precio_venta_mxn
    return acc
  }, {})
  const topProductos = Object.entries(porProducto).sort(([, a], [, b]) => b.mxn - a.mxn).slice(0, 5)

  return (
    <div className="px-4 pt-4 pb-8 space-y-4">
      <Link href={`/negocios/${id}`} className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" />
        {negocio.nombre}
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight inline-flex items-center gap-2">
          <span className="h-8 w-8 rounded-lg inline-flex items-center justify-center bg-purple-500/20 border border-purple-500/40">
            <ShoppingBag className="h-4 w-4 text-purple-300" />
          </span>
          Ventas
        </h1>
        <p className="text-xs text-zinc-500">{negocio.nombre} · {list.length} {list.length === 1 ? 'venta' : 'ventas'}</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3">
          <div className="flex items-center gap-1.5 text-purple-400">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Total vendido</span>
          </div>
          <p className="text-xl font-bold tabular-nums mt-1">{formatMoney(totalVentasMxn, 'MXN')}</p>
          {totalUsdOriginal > 0 && (
            <p className="text-[10px] text-zinc-500 tabular-nums">incl. {formatMoney(totalUsdOriginal, 'USD')}</p>
          )}
        </div>
        <div className="card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Ticket promedio</p>
          <p className="text-xl font-bold tabular-nums mt-1">{formatMoney(ticketPromedio, 'MXN')}</p>
        </div>
      </div>

      {totalCostoMxn > 0 && (
        <div className="card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Margen bruto (sin ads)</p>
          <div className="flex items-baseline justify-between mt-1">
            <p className="text-xl font-bold tabular-nums text-emerald-400">{formatMoney(margenBruto, 'MXN')}</p>
            <p className="text-xs text-zinc-500 tabular-nums">
              {totalVentasMxn > 0 ? `${((margenBruto / totalVentasMxn) * 100).toFixed(1)}%` : '—'}
            </p>
          </div>
          <p className="text-[10px] text-zinc-600 mt-0.5">Costo producto: {formatMoney(totalCostoMxn, 'MXN')}</p>
        </div>
      )}

      {topProductos.length > 1 && (
        <div className="card p-3 space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Top productos</p>
          {topProductos.map(([nombre, v]) => {
            const pct = totalVentasMxn > 0 ? (v.mxn / totalVentasMxn) * 100 : 0
            return (
              <div key={nombre} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate flex-1 mr-2 capitalize">{nombre}</span>
                  <span className="tabular-nums font-medium">{formatMoney(v.mxn, 'MXN')}</span>
                  <span className="text-[10px] text-zinc-500 ml-2 tabular-nums">{v.count}×</span>
                </div>
                <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-purple-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <VentaQuickForm negocioId={id} defaultMoneda={negocio.moneda_principal as 'MXN' | 'USD'} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold px-1">Historial</h2>
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)] p-6 text-center text-sm text-zinc-500">
            Sin ventas aún. Agrega la primera arriba.
          </div>
        ) : (
          <ul className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)] overflow-hidden">
            {list.map((v) => {
              const margenItem = v.precio_venta_mxn - v.costo_producto_mxn
              return (
                <li key={`${v.source}-${v.id}`} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0 leading-tight">
                    <p className="text-sm font-medium truncate capitalize">{v.producto || 'Sin producto'}</p>
                    <p className="text-[10px] text-zinc-500">{formatearFecha(v.fecha, 'dd MMM yyyy')}</p>
                    {v.costo_producto_mxn > 0 && (
                      <p className="text-[10px] text-emerald-500/70 tabular-nums">
                        margen +{formatMoney(margenItem, 'MXN')}
                      </p>
                    )}
                    {v.source === 'transaccion' && (
                      <p className="text-[9px] text-zinc-700">desde transacción</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold tabular-nums text-purple-300">
                      {formatMoney(v.precio_venta, v.moneda)}
                    </p>
                    {v.moneda === 'USD' && (
                      <p className="text-[10px] text-zinc-500 tabular-nums">≈ {formatMoney(v.precio_venta_mxn, 'MXN')}</p>
                    )}
                  </div>
                  {v.source === 'venta' && (
                    <EliminarItemBtn
                      id={v.id}
                      negocioId={id}
                      tipo="venta"
                      etiqueta={`${formatMoney(v.precio_venta, v.moneda)} · ${v.producto || 'sin producto'}`}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
