'use client'

/**
 * Form de venta con carrito de productos del inventario.
 * Descuenta stock + calcula ganancia automáticamente al guardar.
 */

import { useMemo, useState } from 'react'
import { Search, X, Plus, Minus, Trash2, Loader2, AlertTriangle, ShoppingBag, TrendingUp } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { crearVentaConItems } from '@/app/(app)/transacciones/venta-actions'
import { calcularItem, calcularTotalesVenta, type VentaItemInput } from '@/lib/ventas/items'

type Negocio = { id: string; nombre: string; tipo: string }
type Cuenta = { id: string; nombre: string; moneda: string; tipo: string }
type Producto = {
  id: string; nombre: string; precio_mxn: number; stock: number
  categoria: string | null; codigo_barras: string | null
  costo_mxn: number | null
}

const TIPO_EMOJI: Record<string, string> = {
  farmacia: '💊', consultorio: '🩺', pagina_digital: '🌐', general: '🏢',
}

const METODOS = ['efectivo', 'tarjeta', 'transferencia', 'mercado_pago'] as const

export function VentaProductosClient({
  negocios,
  cuentas,
  productos,
}: {
  negocios: Negocio[]
  cuentas: Cuenta[]
  productos: Producto[]
}) {
  const [negocioId, setNegocioId] = useState(negocios[0]?.id ?? '')
  const [cuentaId, setCuentaId] = useState(
    cuentas.find(c => c.moneda === 'MXN')?.id ?? cuentas[0]?.id ?? ''
  )
  const [metodoPago, setMetodoPago] = useState<string>('efectivo')
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
  const [clienteNombre, setClienteNombre] = useState('')
  const [descuentoGlobal, setDescuentoGlobal] = useState(0)
  const [descontarStock, setDescontarStock] = useState(true)
  const [notas, setNotas] = useState('')

  // Items del carrito
  const [items, setItems] = useState<VentaItemInput[]>([])
  const [q, setQ] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Búsqueda
  const productosFiltrados = useMemo(() => {
    if (!q.trim()) return productos.slice(0, 30)
    const qn = q.trim().toLowerCase()
    return productos
      .filter(p => (p.nombre + ' ' + (p.codigo_barras ?? '')).toLowerCase().includes(qn))
      .slice(0, 30)
  }, [productos, q])

  // Items calculados con totales
  const itemsCalc = items.map(calcularItem)
  const tot = calcularTotalesVenta(itemsCalc)
  const totalConDescGlobal = tot.subtotal * (1 - descuentoGlobal / 100)
  const descGlobalMxn = tot.subtotal - totalConDescGlobal
  const gananciaConDescGlobal = (tot.ganancia ?? 0) - descGlobalMxn

  // Acciones
  const addProducto = (p: Producto) => {
    const ix = items.findIndex(i => i.producto_id === p.id)
    if (ix >= 0) {
      cambiarCantidad(ix, 1)
    } else {
      setItems(prev => [...prev, {
        producto_id: p.id,
        nombre_snapshot: p.nombre,
        codigo_barras_snapshot: p.codigo_barras,
        categoria_snapshot: p.categoria,
        costo_unitario_snapshot_mxn: p.costo_mxn,
        cantidad: 1,
        precio_unitario_mxn: p.precio_mxn,
        descuento_pct: 0,
      }])
    }
    setQ('')
  }

  const cambiarCantidad = (idx: number, delta: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: Math.max(0.001, it.cantidad + delta) } : it))
  }

  const setCantidad = (idx: number, n: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: Math.max(0.001, n) } : it))
  }

  const setPrecio = (idx: number, n: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, precio_unitario_mxn: Math.max(0, n) } : it))
  }

  const setDescItem = (idx: number, pct: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, descuento_pct: Math.max(0, Math.min(100, pct)) } : it))
  }

  const quitarItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const guardar = async () => {
    if (!negocioId) return toast.error('Falta', 'Escoge negocio')
    if (!cuentaId) return toast.error('Falta', 'Escoge cuenta')
    if (items.length === 0) return toast.error('Falta', 'Agrega al menos un producto')

    setGuardando(true)
    const r = await crearVentaConItems({
      fecha,
      negocio_id: negocioId,
      cuenta_id: cuentaId,
      metodo_pago: metodoPago || null,
      concepto: null,
      cliente_nombre: clienteNombre.trim() || null,
      notas: notas.trim() || null,
      items,
      descuento_global_pct: descuentoGlobal,
      descontar_stock: descontarStock,
    })
    setGuardando(false)
    if (r?.error) return toast.error('No se guardó', r.error)
    // redirect ya pasó dentro del action
  }

  // Validaciones visibles
  const sinCosto = itemsCalc.filter(i => i.costo_unitario_snapshot_mxn == null || i.costo_unitario_snapshot_mxn === 0).length
  const stockInsuficiente = items.filter(i => {
    if (!i.producto_id) return false
    const p = productos.find(p => p.id === i.producto_id)
    return p && p.stock < i.cantidad
  }).length

  return (
    <div className="space-y-4">
      {/* Setup rápido: negocio + cuenta + método + fecha + cliente */}
      <div className="space-y-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Negocio">
            <select
              value={negocioId}
              onChange={e => setNegocioId(e.target.value)}
              className="input-base w-full h-10 px-2 text-sm"
            >
              {negocios.map(n => (
                <option key={n.id} value={n.id}>{TIPO_EMOJI[n.tipo] ?? '🏢'} {n.nombre}</option>
              ))}
            </select>
          </Field>
          <Field label="Cuenta">
            <select
              value={cuentaId}
              onChange={e => setCuentaId(e.target.value)}
              className="input-base w-full h-10 px-2 text-sm"
            >
              {cuentas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Método">
            <select
              value={metodoPago}
              onChange={e => setMetodoPago(e.target.value)}
              className="input-base w-full h-10 px-2 text-sm capitalize"
            >
              {METODOS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
          </Field>
          <Field label="Fecha">
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="input-base w-full h-10 px-2 text-sm"
            />
          </Field>
          <Field label="Desc. global %">
            <input
              type="number"
              value={descuentoGlobal}
              onChange={e => setDescuentoGlobal(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              step="0.5"
              className="input-base w-full h-10 px-2 text-sm tabular-nums"
            />
          </Field>
        </div>
        <Field label="Cliente (opcional)">
          <input
            type="text"
            value={clienteNombre}
            onChange={e => setClienteNombre(e.target.value)}
            placeholder="Ej. Juan Pérez · Público en general"
            className="input-base w-full h-10 px-3 text-sm"
          />
        </Field>
      </div>

      {/* Buscador de productos */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar producto o código..."
          className="w-full h-12 pl-9 pr-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {q && (
          <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2">
            <X className="h-4 w-4 text-zinc-500" />
          </button>
        )}
      </div>

      {/* Resultados de búsqueda */}
      {q && (
        <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-zinc-800">
          {productosFiltrados.length === 0 ? (
            <p className="text-xs text-zinc-500 text-center py-4">Sin resultados</p>
          ) : productosFiltrados.map(p => {
            const sinStock = p.stock <= 0
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => addProducto(p)}
                className="w-full text-left p-2.5 flex items-center gap-2 hover:bg-zinc-800/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-zinc-100 truncate">{p.nombre}</p>
                  <p className="text-[10px] text-zinc-500">
                    {p.categoria ?? '—'} · stock {p.stock}
                    {p.costo_mxn != null && ` · costo ${formatMoney(p.costo_mxn, 'MXN')}`}
                  </p>
                </div>
                <p className="text-sm font-bold text-emerald-300 tabular-nums shrink-0">
                  {formatMoney(p.precio_mxn, 'MXN')}
                </p>
                {sinStock && <span className="text-[9px] text-rose-300 font-bold">SIN STOCK</span>}
                <Plus className="h-4 w-4 text-emerald-400" />
              </button>
            )
          })}
        </div>
      )}

      {/* Items del carrito */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-6 text-center">
          <ShoppingBag className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">Carrito vacío. Busca arriba y tap para agregar.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {itemsCalc.map((it, idx) => {
            const prod = it.producto_id ? productos.find(p => p.id === it.producto_id) : null
            const stockInsuf = prod ? prod.stock < it.cantidad : false
            return (
              <li key={idx} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-100 truncate">{it.nombre_snapshot}</p>
                    <p className="text-[9px] text-zinc-500 truncate">
                      {it.codigo_barras_snapshot && `${it.codigo_barras_snapshot} · `}
                      {it.costo_unitario_snapshot_mxn != null
                        ? `costo ${formatMoney(it.costo_unitario_snapshot_mxn, 'MXN')}`
                        : 'sin costo cargado'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => quitarItem(idx)}
                    className="h-8 w-8 rounded-md text-rose-300 hover:bg-rose-500/10 inline-flex items-center justify-center"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {/* Cantidad */}
                  <div className="col-span-2 inline-flex items-center gap-0.5 rounded-lg border border-zinc-700 bg-zinc-900">
                    <button onClick={() => cambiarCantidad(idx, -1)} className="h-9 w-9 text-zinc-300"><Minus className="h-4 w-4 mx-auto" /></button>
                    <input
                      type="number"
                      step="0.001"
                      value={it.cantidad}
                      onChange={e => setCantidad(idx, Number(e.target.value) || 1)}
                      className="flex-1 h-9 bg-transparent text-center font-bold tabular-nums text-zinc-100 focus:outline-none text-sm"
                    />
                    <button onClick={() => cambiarCantidad(idx, 1)} className="h-9 w-9 text-zinc-300"><Plus className="h-4 w-4 mx-auto" /></button>
                  </div>

                  {/* Precio */}
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={it.precio_unitario_mxn}
                      onChange={e => setPrecio(idx, Number(e.target.value) || 0)}
                      title="Precio unitario"
                      className="w-full h-9 pl-5 pr-1 rounded-lg border border-zinc-700 bg-zinc-900 text-sm tabular-nums font-semibold"
                    />
                  </div>

                  {/* Descuento por línea */}
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={it.descuento_pct}
                      onChange={e => setDescItem(idx, Number(e.target.value) || 0)}
                      placeholder="Desc"
                      title="Descuento %"
                      className="w-full h-9 px-1 rounded-lg border border-zinc-700 bg-zinc-900 text-sm text-center tabular-nums"
                    />
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px]">%</span>
                  </div>
                </div>

                {/* Subtotal + ganancia */}
                <div className="flex items-center justify-between mt-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    {it.ganancia_mxn != null ? (
                      <span className={cn(
                        'inline-flex items-center gap-0.5 rounded-md px-1.5 h-5 font-bold text-[10px]',
                        it.margen_pct! >= 30 ? 'bg-emerald-500/15 text-emerald-300' :
                        it.margen_pct! >= 10 ? 'bg-amber-500/15 text-amber-300' :
                        'bg-rose-500/15 text-rose-300'
                      )}>
                        <TrendingUp className="h-2.5 w-2.5" />
                        +{formatMoney(it.ganancia_mxn, 'MXN')} ({it.margen_pct!.toFixed(0)}%)
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-500">Sin costo · ganancia ?</span>
                    )}
                    {stockInsuf && (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 h-5 text-[10px] font-bold text-amber-300">
                        <AlertTriangle className="h-2.5 w-2.5" /> Stock {prod?.stock}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-bold text-emerald-300 tabular-nums">
                    {formatMoney(it.subtotal_mxn, 'MXN')}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Notas + toggles */}
      {items.length > 0 && (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 space-y-2">
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="text-sm text-zinc-200">📦 Descontar del stock al guardar</span>
            <input
              type="checkbox"
              checked={descontarStock}
              onChange={e => setDescontarStock(e.target.checked)}
              className="h-5 w-5 accent-emerald-500"
            />
          </label>
          <Field label="Notas (opcional)">
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              placeholder="Términos, comentarios..."
              className="input-base w-full px-3 py-2 text-sm"
            />
          </Field>
        </div>
      )}

      {/* Footer sticky con totales y guardar */}
      {items.length > 0 && (
        <div className="sticky bottom-0 -mx-4 px-4 pb-4 pt-3 bg-gradient-to-t from-[var(--bg-base)] via-[var(--bg-base)] to-transparent">
          <div className="rounded-2xl border border-emerald-500/30 bg-zinc-950/95 backdrop-blur-xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Subtotal</span>
                <span className="font-bold text-zinc-300 tabular-nums">{formatMoney(tot.subtotal, 'MXN')}</span>
              </div>
              {descGlobalMxn > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">Desc. global</span>
                  <span className="font-bold text-rose-300 tabular-nums">-{formatMoney(descGlobalMxn, 'MXN')}</span>
                </div>
              )}
              {(tot.ganancia ?? 0) > 0 && (
                <div className="flex items-center justify-between col-span-2 text-cyan-300">
                  <span>Ganancia estimada</span>
                  <span className="font-bold tabular-nums">+{formatMoney(gananciaConDescGlobal, 'MXN')}</span>
                </div>
              )}
              {sinCosto > 0 && (
                <p className="col-span-2 text-[10px] text-amber-300">
                  ⚠ {sinCosto} {sinCosto === 1 ? 'producto' : 'productos'} sin costo cargado — ganancia incompleta
                </p>
              )}
              {stockInsuficiente > 0 && (
                <p className="col-span-2 text-[10px] text-amber-300">
                  ⚠ {stockInsuficiente} {stockInsuficiente === 1 ? 'producto' : 'productos'} con stock insuficiente
                </p>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-zinc-800 pt-2">
              <span className="text-xs uppercase tracking-wider font-bold text-zinc-400">Total</span>
              <span className="text-2xl font-black text-emerald-300 tabular-nums">
                {formatMoney(totalConDescGlobal, 'MXN')}
              </span>
            </div>

            <button
              type="button"
              disabled={items.length === 0 || guardando}
              onClick={guardar}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-bold text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-30 shadow-lg shadow-emerald-500/30 active:scale-[0.98]"
            >
              {guardando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ShoppingBag className="h-4 w-4" />
                  Registrar venta
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}
