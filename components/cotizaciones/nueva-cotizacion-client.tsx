'use client'

/**
 * Wizard de nueva cotización: 3 pasos.
 *   1. Negocio (selector visual)
 *   2. Cliente (form)
 *   3. Productos (busca del inventario + ajusta cantidad/precio)
 * Footer sticky con totales + botón "Generar cotización".
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Plus, Minus, Trash2, Loader2, ChevronRight, FileText, ChevronLeft } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { crearCotizacion } from '@/app/(app)/cotizaciones/actions'
import { calcularTotales, type CotizacionItem } from '@/lib/cotizaciones/tipos'

type NegocioInput = {
  id: string
  nombre: string
  tipo: 'farmacia' | 'consultorio' | 'pagina_digital' | 'general'
  slogan?: string | null
  rfc?: string | null
  telefono?: string | null
  email?: string | null
  color_primario?: string | null
  color_secundario?: string | null
}

type ProductoInput = {
  id: string
  nombre: string
  precio_mxn: number
  categoria: string | null
  codigo_barras: string | null
  stock: number
}

const TIPO_META: Record<string, { emoji: string; label: string; gradient: string }> = {
  farmacia:       { emoji: '💊', label: 'Farmacia',      gradient: 'from-emerald-500 to-teal-500' },
  consultorio:    { emoji: '🩺', label: 'Consultorio',   gradient: 'from-blue-500 to-cyan-500' },
  pagina_digital: { emoji: '🌐', label: 'Página digital', gradient: 'from-purple-500 to-pink-500' },
  general:        { emoji: '🏢', label: 'General',       gradient: 'from-zinc-500 to-zinc-600' },
}

export function NuevaCotizacionClient({
  negocios,
  productos,
}: {
  negocios: NegocioInput[]
  productos: ProductoInput[]
}) {
  const router = useRouter()
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [negocioSel, setNegocioSel] = useState<NegocioInput | null>(null)

  // Cliente
  const [clienteNombre, setClienteNombre] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [clienteTelefono, setClienteTelefono] = useState('')
  const [clienteRfc, setClienteRfc] = useState('')
  const [clienteDireccion, setClienteDireccion] = useState('')

  // Items
  const [items, setItems] = useState<CotizacionItem[]>([])
  const [q, setQ] = useState('')
  const [descuentoPct, setDescuentoPct] = useState(0)
  const [ivaAplica, setIvaAplica] = useState(false)
  const [notas, setNotas] = useState('')
  const [vigenciaDias, setVigenciaDias] = useState(15)

  const [guardando, setGuardando] = useState(false)

  // Búsqueda de productos
  const productosFiltrados = useMemo(() => {
    if (!q.trim()) return productos.slice(0, 30)
    const qn = q.trim().toLowerCase()
    return productos
      .filter(p => (p.nombre + ' ' + (p.codigo_barras ?? '')).toLowerCase().includes(qn))
      .slice(0, 30)
  }, [productos, q])

  const totales = calcularTotales(items, { descuento_pct: descuentoPct, iva_aplica: ivaAplica })

  // Agregar producto al ticket
  const addProducto = (p: ProductoInput) => {
    const existe = items.find(i => i.producto_id === p.id)
    if (existe) {
      cambiarCantidad(items.indexOf(existe), 1)
    } else {
      setItems(prev => [...prev, {
        producto_id: p.id,
        nombre: p.nombre,
        codigo_barras: p.codigo_barras,
        cantidad: 1,
        precio_unitario_mxn: p.precio_mxn,
        subtotal_mxn: p.precio_mxn,
      }])
    }
  }

  const cambiarCantidad = (idx: number, delta: number) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const nuevaCant = Math.max(1, it.cantidad + delta)
      return { ...it, cantidad: nuevaCant, subtotal_mxn: nuevaCant * it.precio_unitario_mxn }
    }))
  }

  const setCantidad = (idx: number, cant: number) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const c = Math.max(1, Math.floor(cant))
      return { ...it, cantidad: c, subtotal_mxn: c * it.precio_unitario_mxn }
    }))
  }

  const setPrecio = (idx: number, precio: number) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const p = Math.max(0, precio)
      return { ...it, precio_unitario_mxn: p, subtotal_mxn: it.cantidad * p }
    }))
  }

  const quitarItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const guardar = async () => {
    if (!negocioSel) return toast.error('Falta', 'Escoge negocio')
    if (!clienteNombre.trim()) return toast.error('Falta', 'Nombre del cliente')
    if (items.length === 0) return toast.error('Falta', 'Agrega al menos un producto')

    setGuardando(true)
    const r = await crearCotizacion({
      negocio_id: negocioSel.id,
      cliente_nombre: clienteNombre.trim(),
      cliente_email: clienteEmail.trim() || null,
      cliente_telefono: clienteTelefono.trim() || null,
      cliente_rfc: clienteRfc.trim() || null,
      cliente_direccion: clienteDireccion.trim() || null,
      items: items.map(i => ({
        producto_id: i.producto_id,
        nombre: i.nombre,
        codigo_barras: i.codigo_barras,
        cantidad: i.cantidad,
        precio_unitario_mxn: i.precio_unitario_mxn,
      })),
      descuento_pct: descuentoPct,
      iva_aplica: ivaAplica,
      notas: notas.trim() || null,
      vigencia_dias: vigenciaDias,
    })
    setGuardando(false)

    if (r.error) return toast.error('No se creó', r.error)
    if (r.id) {
      toast.success('Cotización creada', r.folio ?? '')
      router.push(`/cotizaciones/${r.id}`)
      router.refresh()
    }
  }

  return (
    <>
      {/* Stepper visual */}
      <div className="flex items-center gap-1.5 mb-2 mt-2">
        {([1, 2, 3] as const).map((n, i) => (
          <div key={n} className="flex items-center gap-1.5 flex-1">
            <div className={cn(
              'h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 shrink-0',
              paso === n ? 'bg-cyan-600 border-cyan-400 text-white' :
              paso > n ? 'bg-emerald-600 border-emerald-400 text-white' :
              'bg-zinc-900 border-zinc-700 text-zinc-500'
            )}>
              {paso > n ? '✓' : n}
            </div>
            <span className={cn(
              'text-[10px] uppercase tracking-wider font-bold',
              paso === n ? 'text-cyan-300' :
              paso > n ? 'text-emerald-300' : 'text-zinc-600'
            )}>
              {n === 1 ? 'Negocio' : n === 2 ? 'Cliente' : 'Productos'}
            </span>
            {i < 2 && <span className="h-px flex-1 bg-zinc-800" />}
          </div>
        ))}
      </div>

      {/* PASO 1 — Negocio */}
      {paso === 1 && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-400">¿Para qué negocio?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {negocios.map(n => {
              const meta = TIPO_META[n.tipo] ?? TIPO_META.general
              const sel = negocioSel?.id === n.id
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setNegocioSel(n)}
                  className={cn(
                    'text-left rounded-2xl border p-3 transition-all active:scale-[0.98]',
                    sel
                      ? 'border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/20'
                      : 'border-[var(--border-subtle)] bg-[var(--bg-card)] hover:border-cyan-500/40'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn('h-11 w-11 rounded-xl bg-gradient-to-br flex items-center justify-center text-xl shrink-0', meta.gradient)}>
                      {meta.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white truncate">{n.nombre}</p>
                      <p className="text-[10px] text-zinc-500">{meta.label}</p>
                    </div>
                    {sel && <span className="text-cyan-300 text-lg">✓</span>}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={!negocioSel}
              onClick={() => setPaso(2)}
              className="h-12 px-5 rounded-xl bg-cyan-600 text-white font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-30 active:scale-95"
            >
              Continuar
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* PASO 2 — Cliente */}
      {paso === 2 && (
        <div className="space-y-3">
          <Field label="Nombre del cliente" required>
            <input
              type="text"
              value={clienteNombre}
              onChange={e => setClienteNombre(e.target.value)}
              placeholder="Ej: Juan Pérez / Empresa SA de CV"
              className="input-base w-full h-12 px-3"
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Email">
              <input
                type="email"
                value={clienteEmail}
                onChange={e => setClienteEmail(e.target.value)}
                placeholder="cliente@email.com"
                className="input-base w-full h-12 px-3"
              />
            </Field>
            <Field label="Teléfono">
              <input
                type="tel"
                value={clienteTelefono}
                onChange={e => setClienteTelefono(e.target.value)}
                placeholder="+52 624 123 4567"
                className="input-base w-full h-12 px-3"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="RFC (opcional)">
              <input
                type="text"
                value={clienteRfc}
                onChange={e => setClienteRfc(e.target.value.toUpperCase())}
                className="input-base w-full h-12 px-3 font-mono uppercase"
              />
            </Field>
            <Field label="Vigencia (días)">
              <input
                type="number"
                value={vigenciaDias}
                onChange={e => setVigenciaDias(Number(e.target.value) || 15)}
                className="input-base w-full h-12 px-3 tabular-nums"
              />
            </Field>
          </div>
          <Field label="Dirección (opcional)">
            <textarea
              value={clienteDireccion}
              onChange={e => setClienteDireccion(e.target.value)}
              rows={2}
              placeholder="Calle, núm, colonia, CP"
              className="input-base w-full px-3 py-2"
            />
          </Field>

          <div className="flex items-center justify-between pt-2 gap-2">
            <button
              type="button"
              onClick={() => setPaso(1)}
              className="h-12 px-4 rounded-xl border border-zinc-700 text-zinc-300 font-bold text-sm inline-flex items-center gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Atrás
            </button>
            <button
              type="button"
              disabled={!clienteNombre.trim()}
              onClick={() => setPaso(3)}
              className="h-12 px-5 rounded-xl bg-cyan-600 text-white font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-30 active:scale-95"
            >
              Continuar
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* PASO 3 — Productos */}
      {paso === 3 && (
        <div className="space-y-3">
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar producto..."
              className="w-full h-12 pl-9 pr-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
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
              ) : productosFiltrados.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { addProducto(p); setQ('') }}
                  className="w-full text-left p-2.5 flex items-center gap-2 hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-zinc-100 truncate">{p.nombre}</p>
                    <p className="text-[10px] text-zinc-500">{p.categoria ?? '—'} · stock {p.stock}</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-300 tabular-nums shrink-0">
                    {formatMoney(p.precio_mxn, 'MXN')}
                  </p>
                  <Plus className="h-4 w-4 text-cyan-400" />
                </button>
              ))}
            </div>
          )}

          {/* Items agregados */}
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-6 text-center">
              <p className="text-sm text-zinc-500">Aún sin productos. Busca arriba y tap para agregar.</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {items.map((it, idx) => (
                <li key={idx} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-100 truncate">{it.nombre}</p>
                      {it.codigo_barras && (
                        <p className="text-[9px] font-mono text-zinc-500">{it.codigo_barras}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => quitarItem(idx)}
                      className="h-8 w-8 rounded-md text-rose-300 hover:bg-rose-500/10 inline-flex items-center justify-center"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900">
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(idx, -1)}
                        className="h-9 w-9 inline-flex items-center justify-center text-zinc-300"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        type="number"
                        value={it.cantidad}
                        onChange={e => setCantidad(idx, Number(e.target.value) || 1)}
                        className="w-12 h-9 bg-transparent text-center font-bold tabular-nums text-zinc-100 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => cambiarCantidad(idx, 1)}
                        className="h-9 w-9 inline-flex items-center justify-center text-zinc-300"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <span className="text-zinc-500 text-xs">×</span>
                    <div className="relative flex-1">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">$</span>
                      <input
                        type="number"
                        value={it.precio_unitario_mxn}
                        onChange={e => setPrecio(idx, Number(e.target.value) || 0)}
                        step="0.01"
                        className="w-full h-9 pl-5 pr-2 rounded-lg border border-zinc-700 bg-zinc-900 text-sm tabular-nums font-semibold"
                      />
                    </div>
                    <p className="text-sm font-bold text-emerald-300 tabular-nums w-24 text-right">
                      {formatMoney(it.subtotal_mxn, 'MXN')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Descuento + IVA + notas */}
          {items.length > 0 && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Descuento %">
                  <input
                    type="number"
                    value={descuentoPct}
                    onChange={e => setDescuentoPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                    step="0.5"
                    className="input-base w-full h-10 px-3 tabular-nums"
                  />
                </Field>
                <Field label="IVA 16%">
                  <label className="input-base w-full h-10 px-3 inline-flex items-center justify-between cursor-pointer">
                    <span className="text-xs text-zinc-300">{ivaAplica ? 'Aplicar' : 'Sin IVA'}</span>
                    <input
                      type="checkbox"
                      checked={ivaAplica}
                      onChange={e => setIvaAplica(e.target.checked)}
                      className="h-5 w-5 accent-cyan-500"
                    />
                  </label>
                </Field>
              </div>
              <Field label="Notas (opcional)">
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  rows={2}
                  placeholder="Términos, plazos de entrega, etc."
                  className="input-base w-full px-3 py-2"
                />
              </Field>
            </div>
          )}

          {/* Footer sticky con totales y guardar */}
          <div className="sticky bottom-0 -mx-4 px-4 pb-4 pt-3 bg-gradient-to-t from-[var(--bg-base)] via-[var(--bg-base)] to-transparent">
            <div className="rounded-2xl border border-cyan-500/30 bg-zinc-950/95 backdrop-blur-xl p-3 space-y-2.5">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500">Subtotal</p>
                  <p className="text-sm font-bold text-zinc-300 tabular-nums">{formatMoney(totales.subtotal, 'MXN')}</p>
                </div>
                {totales.descuento > 0 && (
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-500">Desc.</p>
                    <p className="text-sm font-bold text-rose-300 tabular-nums">-{formatMoney(totales.descuento, 'MXN')}</p>
                  </div>
                )}
                {totales.iva > 0 && (
                  <div>
                    <p className="text-[9px] uppercase tracking-wider text-zinc-500">IVA</p>
                    <p className="text-sm font-bold text-amber-300 tabular-nums">{formatMoney(totales.iva, 'MXN')}</p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-zinc-800 pt-2">
                <span className="text-xs uppercase tracking-wider font-bold text-zinc-400">Total</span>
                <span className="text-2xl font-black text-emerald-300 tabular-nums">
                  {formatMoney(totales.total, 'MXN')}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaso(2)}
                  className="h-12 px-4 rounded-xl border border-zinc-700 text-zinc-300 font-bold text-sm inline-flex items-center gap-1 active:scale-95"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={items.length === 0 || guardando}
                  onClick={guardar}
                  className="flex-1 h-12 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 text-white font-bold text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-30 shadow-lg shadow-cyan-500/30 active:scale-[0.98]"
                >
                  {guardando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Generar cotización
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
        {label}
        {required && <span className="text-rose-400 ml-1">*</span>}
      </label>
      {children}
    </div>
  )
}
