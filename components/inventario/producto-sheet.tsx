'use client'

/**
 * Sheet de detalle del producto. Desliza desde abajo (iOS-style).
 * Foto grande arriba, edición inline de campos, stock con +/- buttons,
 * historial de últimos movimientos, botón eliminar.
 */
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Camera, Minus, Plus, Trash2, Loader2, Check } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { comprimirFoto } from '@/lib/foto-compresion'
import {
  ajustarStock,
  actualizarProducto,
  eliminarProducto,
  subirFotoProducto,
  quitarFotoProducto,
} from '@/app/(app)/inventario/actions'
import type { Producto } from '@/components/inventario/inventario-gallery-client'

const EMOJI_CAT: Record<string, string> = {
  GENERICO: '💊', PATENTE: '🏥', OTC: '🩹',
  'Cuidado Personal': '🧴', Bebidas: '🥤',
  'Departamento de bebe': '👶', Antiácido: '🌿',
  Choco: '🍫',
}

export function ProductoSheet({
  producto,
  rate,
  fotoUrlActiva,
  categoriasDisponibles,
  onClose,
}: {
  producto: Producto
  rate: number
  fotoUrlActiva: boolean
  categoriasDisponibles: string[]
  onClose: () => void
}) {
  const router = useRouter()
  // Estado local de edición
  const [nombre, setNombre] = useState(producto.nombre)
  const [precio, setPrecio] = useState(producto.precio_mxn.toString())
  const [categoria, setCategoria] = useState(producto.categoria ?? '')
  const [stockActual, setStockActual] = useState(producto.stock)
  const [stockMin, setStockMin] = useState(producto.stock_minimo)
  const [codigo, setCodigo] = useState(producto.codigo_barras ?? '')
  const [unidad, setUnidad] = useState(producto.unidad_stock)
  const [foto, setFoto] = useState<string | null>(producto.foto_signed_url)
  // Campos 0041
  const [costo, setCosto] = useState(producto.costo_mxn != null ? String(producto.costo_mxn) : '')
  const [marca, setMarca] = useState(producto.marca ?? '')
  const [ubicacion, setUbicacion] = useState(producto.ubicacion ?? '')
  const [lote, setLote] = useState(producto.lote ?? '')
  const [fechaCaducidad, setFechaCaducidad] = useState(producto.fecha_caducidad ?? '')
  const [sku, setSku] = useState(producto.sku ?? '')
  const [claveSat, setClaveSat] = useState(producto.clave_sat ?? '')
  const [requiereReceta, setRequiereReceta] = useState(producto.requiere_receta === true)
  const [cobraIva, setCobraIva] = useState(producto.cobra_iva !== false)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const fotoInputRef = useRef<HTMLInputElement | null>(null)

  const precioNum = Number(precio) || 0
  const costoNum = Number(costo) || 0
  const usd = precioNum / rate
  // Margen: si tiene costo, calcula
  const tieneCosto = costoNum > 0
  const gananciaUnidad = precioNum - costoNum
  const margenPct = tieneCosto && precioNum > 0 ? (gananciaUnidad / precioNum) * 100 : 0
  const gananciaInventario = gananciaUnidad * stockActual

  // Cerrar con Esc
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Bloquear scroll del body mientras está abierto
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Helpers
  const flash = () => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1200) }

  const guardarCampo = async (cambios: Parameters<typeof actualizarProducto>[0]) => {
    setBusy(true)
    const r = await actualizarProducto(cambios)
    setBusy(false)
    if (r.error) toast.error('No se guardó', r.error)
    else { flash(); router.refresh() }
  }

  const cambiarStock = async (delta: number) => {
    if (busy) return
    const prevStock = stockActual
    setStockActual(Math.max(0, stockActual + delta))
    setBusy(true)
    const r = await ajustarStock({
      producto_id: producto.id,
      cantidad: Math.abs(delta),
      tipo: delta > 0 ? 'entrada' : 'salida',
      motivo: delta > 0 ? 'Ajuste manual +' : 'Ajuste manual −',
    })
    setBusy(false)
    if (r.error) {
      toast.error('No se guardó', r.error)
      setStockActual(prevStock)
    } else {
      flash()
      router.refresh()
    }
  }

  const onSeleccionarFoto = async (file: File | null) => {
    if (!file) return
    if (!fotoUrlActiva) {
      toast.error('Migración pendiente', 'Corre la migración 0040 primero')
      return
    }
    setBusy(true)
    const comprimida = await comprimirFoto(file)
    const fd = new FormData()
    fd.append('producto_id', producto.id)
    fd.append('foto', comprimida)
    const r = await subirFotoProducto(fd)
    setBusy(false)
    if (r.error) toast.error('No se subió', r.error)
    else if (r.foto_url) {
      setFoto(r.foto_url)
      flash()
      router.refresh()
    }
  }

  const onQuitarFoto = async () => {
    if (busy) return
    setBusy(true)
    const r = await quitarFotoProducto(producto.id)
    setBusy(false)
    if (r.error) toast.error('No se quitó', r.error)
    else {
      setFoto(null)
      flash()
      router.refresh()
    }
  }

  const onEliminar = async () => {
    if (!confirm(`¿Eliminar "${producto.nombre}"? Lo puedes restaurar después desde Supabase.`)) return
    setBusy(true)
    const r = await eliminarProducto(producto.id)
    setBusy(false)
    if (r.error) toast.error('No se eliminó', r.error)
    else {
      toast.success('Producto eliminado')
      onClose()
      router.refresh()
    }
  }

  const emoji = EMOJI_CAT[producto.categoria ?? ''] ?? '📦'
  const stockStatus =
    stockActual === 0 ? { color: 'rose', label: 'Agotado' }
    : stockActual <= stockMin ? { color: 'amber', label: 'Bajo stock' }
    : { color: 'emerald', label: 'En stock' }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[92vh] rounded-t-3xl border-t border-x border-[var(--border-subtle)] bg-[var(--bg-base)] overflow-y-auto animate-in slide-in-from-bottom duration-300">
        {/* Drag indicator */}
        <div className="sticky top-0 z-10 bg-[var(--bg-base)] pt-2 pb-1 flex justify-center border-b border-transparent">
          <span className="block h-1.5 w-12 rounded-full bg-zinc-700" />
        </div>

        {/* Botón cerrar + flash */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          {savedFlash && (
            <span className="inline-flex items-center gap-1 px-2 h-7 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-bold animate-in fade-in zoom-in duration-200">
              <Check className="h-3 w-3" /> Guardado
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full bg-zinc-800/80 text-zinc-300 inline-flex items-center justify-center backdrop-blur"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 pb-8 space-y-5 max-w-3xl mx-auto">
          {/* Hero con foto */}
          <div className="relative aspect-[4/3] -mx-4 mt-1 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black overflow-hidden">
            {foto ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={foto} alt={producto.nombre} className="w-full h-full object-contain" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[120px] opacity-30">
                {emoji}
              </div>
            )}
            {/* Botones de foto */}
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onSeleccionarFoto(e.target.files?.[0] ?? null)}
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              {foto && (
                <button
                  type="button"
                  onClick={onQuitarFoto}
                  disabled={busy}
                  className="h-9 w-9 rounded-full bg-black/60 text-rose-300 inline-flex items-center justify-center backdrop-blur"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => fotoInputRef.current?.click()}
                disabled={busy}
                className="h-9 px-4 rounded-full bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-lg shadow-emerald-500/30"
              >
                <Camera className="h-3.5 w-3.5" />
                {foto ? 'Cambiar' : 'Agregar foto'}
              </button>
            </div>
            {/* Status pill */}
            <div className={cn(
              'absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 h-7 rounded-full backdrop-blur border text-[11px] font-bold',
              stockStatus.color === 'rose' && 'bg-rose-500/20 border-rose-500/40 text-rose-300',
              stockStatus.color === 'amber' && 'bg-amber-500/20 border-amber-500/40 text-amber-300',
              stockStatus.color === 'emerald' && 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
            )}>
              <span className={cn(
                'inline-block h-1.5 w-1.5 rounded-full',
                stockStatus.color === 'rose' && 'bg-rose-500',
                stockStatus.color === 'amber' && 'bg-amber-500',
                stockStatus.color === 'emerald' && 'bg-emerald-500',
              )} />
              {stockStatus.label}
            </div>
          </div>

          {/* Nombre + categoría */}
          <div className="space-y-2">
            {editing === 'nombre' ? (
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onBlur={() => {
                  setEditing(null)
                  if (nombre.trim() && nombre !== producto.nombre) {
                    guardarCampo({ producto_id: producto.id, nombre: nombre.trim() })
                  }
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                autoFocus
                className="w-full text-xl font-black bg-[var(--bg-input)] rounded-xl px-3 py-2 border border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing('nombre')}
                className="text-left text-xl font-black text-zinc-100 leading-tight hover:text-emerald-300 transition-colors"
              >
                {nombre}
              </button>
            )}

            <div className="flex items-center flex-wrap gap-2">
              {/* Categoría como dropdown */}
              <select
                value={categoria}
                onChange={(e) => {
                  setCategoria(e.target.value)
                  guardarCampo({ producto_id: producto.id, categoria: e.target.value || null })
                }}
                className="h-7 text-[11px] font-bold uppercase tracking-wider rounded-full bg-zinc-800 border border-zinc-700 px-2 text-zinc-300"
              >
                <option value="">— Sin categoría —</option>
                {categoriasDisponibles.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {producto.codigo_barras && (
                <span className="text-[10px] text-zinc-500 font-mono">{producto.codigo_barras}</span>
              )}
            </div>
          </div>

          {/* Precio */}
          <Section title="Precio">
            {editing === 'precio' ? (
              <input
                type="text"
                inputMode="decimal"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                onBlur={() => {
                  setEditing(null)
                  const n = Number(precio)
                  if (!isNaN(n) && n !== producto.precio_mxn) {
                    guardarCampo({ producto_id: producto.id, precio_mxn: n })
                  }
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                autoFocus
                className="w-full text-3xl font-black tabular-nums bg-[var(--bg-input)] rounded-xl px-4 py-3 border border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing('precio')}
                className="block text-left w-full"
              >
                <p className="text-3xl font-black text-emerald-300 tabular-nums leading-none">
                  {formatMoney(Number(precio) || 0, 'MXN')}
                </p>
                <p className="text-sm text-cyan-300/80 tabular-nums mt-1">
                  ≈ {formatMoney(usd || 0, 'USD')}
                </p>
              </button>
            )}
            <p className="text-[10px] text-zinc-500 mt-2">Tap para editar precio</p>
          </Section>

          {/* Stock */}
          <Section title="Stock">
            <div className="flex items-center justify-between gap-3 my-1">
              <button
                type="button"
                onClick={() => cambiarStock(-1)}
                disabled={busy || stockActual === 0}
                className="h-14 w-14 rounded-2xl border-2 border-rose-500/40 bg-rose-500/10 text-rose-300 inline-flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all"
              >
                <Minus className="h-6 w-6" />
              </button>
              <div className="flex-1 text-center">
                <p className="text-5xl font-black text-zinc-100 tabular-nums leading-none">
                  {stockActual}
                </p>
                <p className="text-xs text-zinc-500 mt-1">{unidad}</p>
              </div>
              <button
                type="button"
                onClick={() => cambiarStock(1)}
                disabled={busy}
                className="h-14 w-14 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-300 inline-flex items-center justify-center disabled:opacity-30 active:scale-95 transition-all"
              >
                <Plus className="h-6 w-6" />
              </button>
            </div>
            <div className="flex items-center gap-2 mt-3">
              {/* Botones rápidos +5, +10 */}
              {[5, 10, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => cambiarStock(n)}
                  disabled={busy}
                  className="flex-1 h-9 text-xs font-semibold rounded-lg border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
                >
                  +{n}
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
              <span>Mínimo de alerta:</span>
              <input
                type="number"
                value={stockMin}
                onChange={(e) => setStockMin(Number(e.target.value) || 0)}
                onBlur={() => {
                  if (stockMin !== producto.stock_minimo) {
                    guardarCampo({ producto_id: producto.id, stock_minimo: stockMin })
                  }
                }}
                className="w-16 h-7 px-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-input)] text-center font-mono tabular-nums text-zinc-200"
              />
            </div>
          </Section>

          {/* Costo y margen */}
          <Section title="Costo y ganancia">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Costo MXN</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={costo}
                  onChange={(e) => setCosto(e.target.value)}
                  onBlur={() => {
                    const n = Number(costo)
                    if (costo === '' && producto.costo_mxn != null) {
                      guardarCampo({ producto_id: producto.id, costo_mxn: null })
                    } else if (!isNaN(n) && n !== (producto.costo_mxn ?? -1)) {
                      guardarCampo({ producto_id: producto.id, costo_mxn: n })
                    }
                  }}
                  placeholder="0.00"
                  className="w-full mt-1 h-11 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] text-base font-bold tabular-nums"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Margen</label>
                <div className={cn(
                  'mt-1 h-11 px-3 rounded-lg flex items-center justify-end font-bold tabular-nums',
                  !tieneCosto && 'bg-zinc-900 text-zinc-600',
                  tieneCosto && margenPct >= 30 && 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30',
                  tieneCosto && margenPct >= 10 && margenPct < 30 && 'bg-amber-500/10 text-amber-300 border border-amber-500/30',
                  tieneCosto && margenPct < 10 && 'bg-rose-500/10 text-rose-300 border border-rose-500/30',
                )}>
                  {tieneCosto ? `${margenPct.toFixed(1)}%` : '—'}
                </div>
              </div>
            </div>
            {tieneCosto && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 p-2">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold">Ganancia/unidad</p>
                  <p className="text-base font-black text-emerald-300 tabular-nums">
                    {formatMoney(gananciaUnidad, 'MXN')}
                  </p>
                </div>
                <div className="rounded-lg bg-zinc-900/40 border border-zinc-800 p-2">
                  <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold">Ganancia total</p>
                  <p className="text-base font-black text-cyan-300 tabular-nums">
                    {formatMoney(gananciaInventario, 'MXN')}
                  </p>
                  <p className="text-[9px] text-zinc-500">{stockActual} u en stock</p>
                </div>
              </div>
            )}
          </Section>

          {/* Datos avanzados (expandible) */}
          <details className="group rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] overflow-hidden">
            <summary className="cursor-pointer px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-200">
              Datos avanzados
            </summary>
            <div className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Código de barras</label>
                  <input
                    type="text"
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    onBlur={() => {
                      if (codigo !== (producto.codigo_barras ?? '')) {
                        guardarCampo({ producto_id: producto.id, codigo_barras: codigo || null })
                      }
                    }}
                    className="w-full mt-1 h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">SKU</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    onBlur={() => {
                      if (sku !== (producto.sku ?? '')) {
                        guardarCampo({ producto_id: producto.id, sku: sku || null })
                      }
                    }}
                    className="w-full mt-1 h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Marca</label>
                  <input
                    type="text"
                    value={marca}
                    onChange={(e) => setMarca(e.target.value)}
                    onBlur={() => {
                      if (marca !== (producto.marca ?? '')) {
                        guardarCampo({ producto_id: producto.id, marca: marca || null })
                      }
                    }}
                    className="w-full mt-1 h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Ubicación</label>
                  <input
                    type="text"
                    value={ubicacion}
                    onChange={(e) => setUbicacion(e.target.value)}
                    onBlur={() => {
                      if (ubicacion !== (producto.ubicacion ?? '')) {
                        guardarCampo({ producto_id: producto.id, ubicacion: ubicacion || null })
                      }
                    }}
                    placeholder="Estante 3B"
                    className="w-full mt-1 h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Unidad de venta</label>
                <input
                  type="text"
                  value={unidad}
                  onChange={(e) => setUnidad(e.target.value)}
                  onBlur={() => {
                    if (unidad !== producto.unidad_stock) {
                      guardarCampo({ producto_id: producto.id, unidad_stock: unidad })
                    }
                  }}
                  className="w-full mt-1 h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm"
                  placeholder="unidad, caja, frasco..."
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Lote</label>
                  <input
                    type="text"
                    value={lote}
                    onChange={(e) => setLote(e.target.value)}
                    onBlur={() => {
                      if (lote !== (producto.lote ?? '')) {
                        guardarCampo({ producto_id: producto.id, lote: lote || null })
                      }
                    }}
                    className="w-full mt-1 h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Caducidad</label>
                  <input
                    type="date"
                    value={fechaCaducidad}
                    onChange={(e) => setFechaCaducidad(e.target.value)}
                    onBlur={() => {
                      if (fechaCaducidad !== (producto.fecha_caducidad ?? '')) {
                        guardarCampo({ producto_id: producto.id, fecha_caducidad: fechaCaducidad || null })
                      }
                    }}
                    className="w-full mt-1 h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">Clave SAT</label>
                <input
                  type="text"
                  value={claveSat}
                  onChange={(e) => setClaveSat(e.target.value)}
                  onBlur={() => {
                    if (claveSat !== (producto.clave_sat ?? '')) {
                      guardarCampo({ producto_id: producto.id, clave_sat: claveSat || null })
                    }
                  }}
                  placeholder="Para CFDI"
                  className="w-full mt-1 h-10 px-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-input)] text-sm font-mono"
                />
              </div>

              {/* Toggles */}
              <div className="flex flex-col gap-2 pt-2">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-sm text-zinc-200">🩺 Requiere receta médica</span>
                  <input
                    type="checkbox"
                    checked={requiereReceta}
                    onChange={(e) => {
                      setRequiereReceta(e.target.checked)
                      guardarCampo({ producto_id: producto.id, requiere_receta: e.target.checked })
                    }}
                    className="h-5 w-5 accent-purple-500"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-sm text-zinc-200">📊 Cobra IVA</span>
                  <input
                    type="checkbox"
                    checked={cobraIva}
                    onChange={(e) => {
                      setCobraIva(e.target.checked)
                      guardarCampo({ producto_id: producto.id, cobra_iva: e.target.checked })
                    }}
                    className="h-5 w-5 accent-emerald-500"
                  />
                </label>
              </div>
            </div>
          </details>

          {/* Eliminar */}
          <button
            type="button"
            onClick={onEliminar}
            disabled={busy}
            className="w-full h-11 rounded-xl border border-rose-500/30 text-rose-300 inline-flex items-center justify-center gap-2 text-sm font-medium hover:bg-rose-500/10"
          >
            <Trash2 className="h-4 w-4" />
            Eliminar producto
          </button>

          {busy && (
            <div className="fixed inset-x-0 bottom-0 flex justify-center pb-4 z-[60] pointer-events-none">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800 text-zinc-200 text-xs shadow-lg">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Guardando…
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{title}</p>
      {children}
    </div>
  )
}
