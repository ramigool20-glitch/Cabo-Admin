'use client'

/**
 * POS para Cvu Pharmacy.
 * Layout 2 columnas (productos | ticket). Cobro multi-método con ticket PNG.
 */

import { useMemo, useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Search, Plus, Minus, Trash2, X, ShoppingBag, AlertTriangle, ScanLine, ChevronUp, LogOut, FileText } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { CobroSheet } from '@/components/pos/cobro-sheet'
import { BarcodeScanner } from '@/components/inventario/barcode-scanner'
import { calcularItem, calcularTotalesVenta, type VentaItemInput } from '@/lib/ventas/items'

type Negocio = { id: string; nombre: string; tipo: string } | null
type Cuenta = { id: string; nombre: string; moneda: string; tipo: string }
type Producto = {
  id: string; nombre: string; precio_mxn: number; stock: number
  categoria: string | null; codigo_barras: string | null
  costo_mxn: number | null
  foto_path: string | null; foto_signed_url: string | null
}

const EMOJI_CAT: Record<string, string> = {
  GENERICO: '💊', PATENTE: '🏥', OTC: '🩹',
  'Cuidado Personal': '🧴', Bebidas: '🥤',
  'Departamento de bebe': '👶', Antiácido: '🌿',
  Choco: '🍫',
}

export function PosClient({
  negocio,
  cuentas,
  productos,
  categorias,
  rate,
  userNombre,
  esCajera,
}: {
  negocio: Negocio
  cuentas: Cuenta[]
  productos: Producto[]
  categorias: string[]
  rate: number
  userNombre: string
  esCajera: boolean
}) {
  const [q, setQ] = useState('')
  const [categoria, setCategoria] = useState('')
  const [items, setItems] = useState<VentaItemInput[]>([])
  const [scannerOpen, setScannerOpen] = useState(false)
  const [cobroOpen, setCobroOpen] = useState(false)
  // En mobile el ticket es un bottom-sheet (colapsado/expandido).
  // En desktop md+ siempre se ve como sidebar.
  const [mobileTicketOpen, setMobileTicketOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Focus input al cargar y al cerrar sheets (atajo /)
  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isTyping = ['INPUT', 'TEXTAREA'].includes(target.tagName)
      if (e.key === '/' && !isTyping) {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape' && !isTyping) {
        setQ('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Búsqueda con filtros
  const productosFiltrados = useMemo(() => {
    const qn = q.trim().toLowerCase()
    return productos.filter(p => {
      if (categoria && p.categoria !== categoria) return false
      if (qn) {
        const en = (p.nombre + ' ' + (p.codigo_barras ?? '')).toLowerCase()
        if (!en.includes(qn)) return false
      }
      return true
    }).slice(0, 60)
  }, [productos, q, categoria])

  // Items calculados
  const itemsCalc = items.map(calcularItem)
  const tot = calcularTotalesVenta(itemsCalc)

  // Agregar al carrito
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
    // Limpiar búsqueda y re-focus (estilo POS)
    setQ('')
    inputRef.current?.focus()
  }

  const cambiarCantidad = (idx: number, delta: number) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const nueva = Math.max(0.001, it.cantidad + delta)
      return { ...it, cantidad: nueva }
    }))
  }

  const setCantidad = (idx: number, n: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: Math.max(0.001, n) } : it))
  }

  const quitarItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const limpiarTodo = () => {
    if (items.length === 0) return
    if (!confirm(`¿Cancelar venta? Se quitarán ${items.length} productos del ticket.`)) return
    setItems([])
    setQ('')
    toast.success('Venta cancelada', 'Ticket vacío')
  }

  // Buscar por código escaneado
  const onScanResult = (code: string) => {
    const found = productos.find(p => p.codigo_barras === code)
    if (found) {
      addProducto(found)
      toast.success('Agregado', found.nombre.slice(0, 40))
    } else {
      toast.error('No encontrado', `Código: ${code}`)
    }
  }

  // Iniciar cobro
  const iniciarCobro = () => {
    if (items.length === 0) return toast.error('Falta', 'Agrega productos al ticket')
    if (!negocio) return toast.error('Sin negocio', 'Crea Cvu Pharmacy local')
    if (cuentas.length === 0) return toast.error('Sin cuentas', 'Crea cuentas activas en MXN')
    setCobroOpen(true)
  }

  // Falta validar
  if (!negocio) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 max-w-md space-y-3 text-center">
          <AlertTriangle className="h-10 w-10 text-rose-300 mx-auto" />
          <p className="text-lg font-bold text-rose-200">Falta el negocio "Cvu Pharmacy local"</p>
          <p className="text-sm text-rose-200/80">El POS solo opera en ese negocio. Créalo o renómbralo en <code className="font-mono">/negocios</code>.</p>
        </div>
      </div>
    )
  }
  if (cuentas.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 max-w-md space-y-3 text-center">
          <AlertTriangle className="h-10 w-10 text-rose-300 mx-auto" />
          <p className="text-lg font-bold text-rose-200">No hay cuentas activas en MXN</p>
          <p className="text-sm text-rose-200/80">Necesitas al menos una para asignar los ingresos del POS.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-[var(--bg-base)] flex flex-col overflow-hidden" style={{ height: '100dvh' }}>
      {/* Header premium con branding CVU Pharmacy */}
      <header className="border-b border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-cyan-500/5 to-transparent backdrop-blur-md px-3 py-2.5 flex items-center gap-2.5 shrink-0">
        {/* Logo cuadrado con gradiente + emoji */}
        <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-500 via-emerald-400 to-cyan-500 shadow-lg shadow-emerald-500/40 inline-flex items-center justify-center shrink-0 ring-1 ring-white/20">
          <span className="text-xl filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]">💊</span>
        </div>
        <div className="min-w-0 leading-tight">
          <p className="text-base font-black text-zinc-100 truncate tracking-tight inline-flex items-center gap-1.5">
            CVU <span className="text-emerald-300">Pharmacy</span>
          </p>
          <p className="text-[10px] text-zinc-500 truncate inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {userNombre} · {new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/pos/corte"
            className="h-9 px-2.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 text-[11px] font-bold inline-flex items-center gap-1 active:scale-95 hover:bg-cyan-500/25 transition-colors"
            title="Corte de caja"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Corte</span>
          </Link>
          <Link
            href="/login?logout=1"
            className="h-9 px-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-bold inline-flex items-center gap-1 active:scale-95 hover:bg-rose-500/25 transition-colors"
            title="Cerrar sesión"
            onClick={async (e) => {
              e.preventDefault()
              const { createBrowserClient } = await import('@supabase/ssr')
              const supa = createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
              )
              await supa.auth.signOut()
              window.location.href = '/login'
            }}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Salir</span>
          </Link>
        </div>
      </header>

      {/* Layout: mobile stack vertical (ticket es bottom-sheet), desktop side-by-side */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* COLUMNA IZQUIERDA: PRODUCTOS */}
        <div className="flex-1 flex flex-col overflow-hidden md:border-r border-zinc-800">
          {/* Barra de búsqueda + scanner */}
          <div className="p-3 border-b border-zinc-800 bg-zinc-950/60 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Buscar producto o escanear código…"
                  className="w-full h-12 pl-10 pr-9 rounded-xl border border-zinc-700 bg-zinc-900 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {q && (
                  <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="h-4 w-4 text-zinc-500" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="h-12 w-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 inline-flex items-center justify-center text-white shrink-0"
                title="Escanear código (cámara)"
              >
                <ScanLine className="h-5 w-5" />
              </button>
            </div>

            {/* Chips categorías */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setCategoria('')}
                className={cn(
                  'shrink-0 h-7 px-2.5 rounded-full text-[10px] border transition-all',
                  !categoria
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                )}
              >
                Todas ({productos.length})
              </button>
              {categorias.slice(0, 12).map(c => {
                const count = productos.filter(p => p.categoria === c).length
                const em = EMOJI_CAT[c] ?? '📦'
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategoria(categoria === c ? '' : c)}
                    className={cn(
                      'shrink-0 h-7 px-2.5 rounded-full text-[10px] border transition-all inline-flex items-center gap-1',
                      categoria === c
                        ? 'border-cyan-500 bg-cyan-500 text-white'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    )}
                  >
                    <span>{em}</span>{c} ({count})
                  </button>
                )
              })}
            </div>
          </div>

          {/* Grid productos */}
          <div className="flex-1 overflow-y-auto p-3" style={{ WebkitOverflowScrolling: 'touch' }}>
            {productosFiltrados.length === 0 ? (
              <div className="text-center py-10 text-zinc-500 text-sm">
                Sin resultados {q && `para "${q}"`}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {productosFiltrados.map(p => {
                  const emoji = p.categoria === 'Choco' ? '📦' : (EMOJI_CAT[p.categoria ?? ''] ?? '📦')
                  const sinStock = p.stock <= 0
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProducto(p)}
                      className={cn(
                        'text-left rounded-xl border bg-zinc-900 overflow-hidden hover:border-emerald-500/40 active:scale-[0.97] transition-all',
                        sinStock ? 'border-rose-500/30 opacity-60' : 'border-zinc-700'
                      )}
                    >
                      <div className="relative aspect-square bg-gradient-to-br from-zinc-800/60 to-zinc-950 flex items-center justify-center">
                        {p.foto_signed_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={p.foto_signed_url} alt={p.nombre} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-4xl opacity-50">{emoji}</span>
                        )}
                        <span className={cn(
                          'absolute top-1.5 right-1.5 inline-flex items-center px-1.5 h-5 rounded-full text-[9px] font-bold border tabular-nums backdrop-blur',
                          sinStock
                            ? 'bg-rose-500/20 text-rose-200 border-rose-500/40'
                            : p.stock <= 3
                              ? 'bg-amber-500/20 text-amber-200 border-amber-500/40'
                              : 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                        )}>{p.stock}</span>
                      </div>
                      <div className="p-1.5 space-y-0.5">
                        <p className="text-[11px] font-semibold text-zinc-100 leading-tight line-clamp-2 min-h-[28px]">{p.nombre}</p>
                        <p className="text-sm font-black text-emerald-300 tabular-nums leading-none">{formatMoney(p.precio_mxn, 'MXN')}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: TICKET — desktop sidebar / mobile bottom-sheet */}
        <aside
          className={cn(
            'flex flex-col bg-zinc-950 z-40 transition-all duration-300',
            // Desktop: sidebar tradicional
            'md:relative md:w-80 lg:w-96 md:translate-y-0 md:max-h-none',
            // Mobile: fixed bottom-sheet, colapsado por default
            'fixed inset-x-0 bottom-0 border-t border-emerald-500/30 rounded-t-2xl md:rounded-none md:border-t-0',
            mobileTicketOpen ? 'max-h-[80dvh]' : 'max-h-[80px]',
            // En desktop ignora mobileTicketOpen
            'md:max-h-none md:border-emerald-500/30'
          )}
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Header del ticket — en mobile sirve como handle para abrir/cerrar */}
          <button
            type="button"
            onClick={() => setMobileTicketOpen(v => !v)}
            className="md:cursor-default px-3 py-2 border-b border-zinc-800 flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2 flex-1">
              <div>
                <p className="text-sm font-black text-zinc-100 leading-tight">Ticket {items.length > 0 && `(${items.length})`}</p>
                <p className="text-[10px] text-zinc-500 leading-tight md:hidden">
                  {items.length === 0 ? 'Tap para abrir' : `Total ${formatMoney(tot.subtotal, 'MXN')}`}
                </p>
                <p className="text-[10px] text-zinc-500 leading-tight hidden md:block">
                  {items.length} item{items.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); limpiarTodo() }}
                  className="h-7 px-2 rounded-md border border-rose-500/30 text-rose-300 text-[10px] font-bold inline-flex items-center gap-1 active:scale-95 cursor-pointer"
                  title="Cancelar venta"
                >
                  <Trash2 className="h-3 w-3" />
                  Cancelar
                </span>
              )}
              {/* Chevron solo en mobile (indicador) */}
              <ChevronUp className={cn(
                'h-5 w-5 text-zinc-400 md:hidden transition-transform',
                mobileTicketOpen && 'rotate-180'
              )} />
            </div>
          </button>

          {/* Items del ticket — solo visible cuando expandido (mobile) o siempre (desktop) */}
          <div
            className={cn(
              'flex-1 overflow-y-auto p-2 space-y-1.5',
              !mobileTicketOpen && 'hidden md:block'
            )}
            style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
          >
            {items.length === 0 ? (
              <div className="text-center py-12 text-zinc-600 text-sm">
                <ShoppingBag className="h-10 w-10 mx-auto mb-2 opacity-30" />
                Carrito vacío
              </div>
            ) : (
              itemsCalc.map((it, idx) => (
                <div key={idx} className="rounded-lg border border-zinc-700 bg-zinc-900 p-2">
                  <div className="flex items-start gap-2 mb-1.5">
                    <p className="text-xs font-semibold text-zinc-100 flex-1 leading-tight line-clamp-2">{it.nombre_snapshot}</p>
                    <button
                      type="button"
                      onClick={() => quitarItem(idx)}
                      className="h-6 w-6 rounded text-rose-300 hover:bg-rose-500/10 inline-flex items-center justify-center shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-950">
                      <button onClick={() => cambiarCantidad(idx, -1)} className="h-7 w-7 inline-flex items-center justify-center text-zinc-300">
                        <Minus className="h-3 w-3" />
                      </button>
                      <input
                        type="number"
                        value={it.cantidad}
                        step="1"
                        onChange={e => setCantidad(idx, Number(e.target.value) || 1)}
                        className="w-10 h-7 bg-transparent text-center text-xs font-bold tabular-nums text-zinc-100 focus:outline-none"
                      />
                      <button onClick={() => cambiarCantidad(idx, 1)} className="h-7 w-7 inline-flex items-center justify-center text-zinc-300">
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="text-[10px] text-zinc-500">× {formatMoney(it.precio_unitario_mxn, 'MXN')}</span>
                    <p className="ml-auto text-sm font-bold text-emerald-300 tabular-nums">
                      {formatMoney(it.subtotal_mxn, 'MXN')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Total + Botón cobrar — solo visible expandido en mobile, siempre en desktop */}
          <div
            className={cn(
              'border-t border-zinc-800 p-3 bg-zinc-950 space-y-2',
              !mobileTicketOpen && 'hidden md:block'
            )}
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-wider font-bold text-zinc-500">Total</span>
              <span className="text-2xl font-black text-emerald-300 tabular-nums">
                {formatMoney(tot.subtotal, 'MXN')}
              </span>
            </div>
            <button
              type="button"
              onClick={iniciarCobro}
              disabled={items.length === 0}
              className="w-full h-14 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-black text-base inline-flex items-center justify-center gap-2 disabled:opacity-30 shadow-lg shadow-emerald-500/30 active:scale-[0.98]"
            >
              💵 COBRAR
            </button>
            <p className="text-center text-[9px] text-zinc-600 hidden md:block">
              Atajos: <kbd className="font-mono text-zinc-500">/</kbd> buscar · <kbd className="font-mono text-zinc-500">Esc</kbd> limpiar
            </p>
          </div>

          {/* Bar colapsada en mobile cuando hay items y no está expandido */}
          {items.length > 0 && !mobileTicketOpen && (
            <button
              type="button"
              onClick={() => setMobileTicketOpen(true)}
              className="md:hidden absolute inset-x-0 bottom-0 mx-2 mb-2 h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white font-black inline-flex items-center justify-between px-4 shadow-lg shadow-emerald-500/30 active:scale-[0.98]"
              style={{ marginBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
            >
              <span className="inline-flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                {items.length} item{items.length === 1 ? '' : 's'}
              </span>
              <span className="tabular-nums">{formatMoney(tot.subtotal, 'MXN')}</span>
              <span className="text-xs opacity-80">Ver →</span>
            </button>
          )}
        </aside>
      </div>

      {/* Backdrop cuando ticket abierto en mobile */}
      {mobileTicketOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setMobileTicketOpen(false)}
        />
      )}

      {/* Scanner */}
      <BarcodeScanner
        active={scannerOpen}
        onResult={onScanResult}
        onClose={() => setScannerOpen(false)}
        autoClose={true}
      />

      {/* Cobro */}
      {cobroOpen && (
        <CobroSheet
          open={cobroOpen}
          onClose={() => setCobroOpen(false)}
          items={items}
          totalMxn={tot.subtotal}
          negocioId={negocio.id}
          cuentas={cuentas}
          onSuccess={() => {
            setItems([])
            setCobroOpen(false)
            inputRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}
