'use client'

/**
 * POS para Cvu Pharmacy.
 *
 * Funcionalidades:
 *   - Layout 2 columnas desktop / bottom-sheet mobile
 *   - Múltiples tickets en tabs (T1 / T2 / +)
 *   - Modo claro premium (rojo/negro/blanco) + oscuro
 *   - Atajos teclado: / busca, Esc limpia, F2 nuevo ticket
 *   - Persistencia en localStorage (tabs + tema)
 */

import Link from 'next/link'
import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { Search, Plus, Minus, Trash2, X, ShoppingBag, AlertTriangle, ScanLine, ChevronUp, LogOut, FileText, Sun, Moon, Clock } from 'lucide-react'
import { cn, formatMoney } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { CobroSheet } from '@/components/pos/cobro-sheet'
import { CvuLogo } from '@/components/pos/cvu-logo'
import { BarcodeScanner } from '@/components/inventario/barcode-scanner'
import { calcularItem, calcularTotalesVenta, type VentaItemInput } from '@/lib/ventas/items'
import { useRealtimeProductos } from '@/lib/pos/use-realtime-productos'
import { usePosConnection } from '@/lib/pos/use-pos-connection'
import { crearVentaConItems } from '@/app/(app)/transacciones/venta-actions'

type Negocio = { id: string; nombre: string; tipo: string } | null
type Cuenta = { id: string; nombre: string; moneda: string; tipo: string }
type Producto = {
  id: string; nombre: string; precio_mxn: number; stock: number
  categoria: string | null; codigo_barras: string | null
  costo_mxn: number | null
  foto_path: string | null; foto_signed_url: string | null
}

type Ticket = {
  id: string
  nombre: string
  items: VentaItemInput[]
}

const EMOJI_CAT: Record<string, string> = {
  GENERICO: '💊', PATENTE: '🏥', OTC: '🩹',
  'Cuidado Personal': '🧴', Bebidas: '🥤',
  'Departamento de bebe': '👶', Antiácido: '🌿',
  Choco: '🍫',
}

const LS_TICKETS = 'pos_tickets_v1'
const LS_TEMA   = 'pos_tema_v1'
const LS_ACTIVE = 'pos_active_tab_v1'

const nuevoTicket = (n: number): Ticket => ({
  id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  nombre: `T${n}`,
  items: [],
})

export function PosClient({
  negocio,
  cuentas,
  productos: productosIniciales,
  categorias,
  rate,
  userNombre,
  esCajera,
  favoritosIds = [],
}: {
  negocio: Negocio
  cuentas: Cuenta[]
  productos: Producto[]
  categorias: string[]
  rate: number
  userNombre: string
  esCajera: boolean
  favoritosIds?: string[]
}) {
  // Productos en estado local para que Realtime los pueda actualizar en vivo
  const [productos, setProductos] = useState<Producto[]>(productosIniciales)
  // Si el server da una nueva versión inicial (ej. tras recarga), sincronizar
  useEffect(() => { setProductos(productosIniciales) }, [productosIniciales])

  // Realtime: escucha cambios en inventario_productos y los aplica al catálogo
  const [realtimeActivo, setRealtimeActivo] = useState(true)
  useRealtimeProductos(setProductos, (tipo, nombre) => {
    if (tipo === 'update') {
      toast.success('🔄 Catálogo actualizado', nombre.slice(0, 40))
    } else if (tipo === 'insert') {
      toast.success('✨ Nuevo producto', nombre.slice(0, 40))
    } else if (tipo === 'delete') {
      toast.error('Producto retirado', nombre.slice(0, 40))
    }
  })
  // Si nunca falla la suscripción, dejamos el indicador encendido.
  useEffect(() => { setRealtimeActivo(true) }, [])

  // POS-7 Offline: estado de conexión + cola pendiente + auto-sync
  const conn = usePosConnection(crearVentaConItems, (r) => {
    if (r.exitosas > 0) {
      toast.success(`✓ ${r.exitosas} venta${r.exitosas === 1 ? '' : 's'} sincronizada${r.exitosas === 1 ? '' : 's'}`, '')
    }
    if (r.fallidas > 0) {
      toast.error(`${r.fallidas} venta${r.fallidas === 1 ? '' : 's'} con error`, 'Revisa la cola')
    }
  })
  // ── TEMA ───────────────────────────────────────────────
  // Default: claro para cajera (Tania), oscuro para admin
  const [tema, setTema] = useState<'light' | 'dark'>(esCajera ? 'light' : 'dark')
  useEffect(() => {
    const stored = localStorage.getItem(LS_TEMA)
    if (stored === 'light' || stored === 'dark') setTema(stored)
  }, [])
  useEffect(() => {
    localStorage.setItem(LS_TEMA, tema)
  }, [tema])

  // ── MÚLTIPLES TICKETS (POS-3) ──────────────────────────
  const [tickets, setTickets] = useState<Ticket[]>([nuevoTicket(1)])
  const [activeTabIdx, setActiveTabIdx] = useState(0)

  // Cargar tickets de localStorage al inicio
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_TICKETS)
      if (stored) {
        const parsed = JSON.parse(stored) as Ticket[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTickets(parsed)
          const idx = Number(localStorage.getItem(LS_ACTIVE) ?? 0)
          if (idx >= 0 && idx < parsed.length) setActiveTabIdx(idx)
        }
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Guardar tickets cuando cambian
  useEffect(() => {
    try {
      localStorage.setItem(LS_TICKETS, JSON.stringify(tickets))
      localStorage.setItem(LS_ACTIVE, String(activeTabIdx))
    } catch { /* ignore */ }
  }, [tickets, activeTabIdx])

  const items = tickets[activeTabIdx]?.items ?? []
  const setItems = useCallback((updater: VentaItemInput[] | ((prev: VentaItemInput[]) => VentaItemInput[])) => {
    setTickets(prev => prev.map((t, i) => {
      if (i !== activeTabIdx) return t
      const newItems = typeof updater === 'function' ? updater(t.items) : updater
      return { ...t, items: newItems }
    }))
  }, [activeTabIdx])

  const agregarTab = () => {
    if (tickets.length >= 5) return toast.error('Máximo 5 tickets a la vez', '')
    setTickets(prev => [...prev, nuevoTicket(prev.length + 1)])
    setActiveTabIdx(tickets.length)
  }

  const cerrarTab = (idx: number) => {
    if (tickets.length === 1) {
      // Si es el único, lo limpia
      if (tickets[0].items.length > 0 && !confirm('¿Vaciar el ticket?')) return
      setTickets([nuevoTicket(1)])
      setActiveTabIdx(0)
      return
    }
    if (tickets[idx].items.length > 0 && !confirm(`¿Cerrar ${tickets[idx].nombre}? Tiene ${tickets[idx].items.length} producto(s).`)) return
    setTickets(prev => prev.filter((_, i) => i !== idx))
    setActiveTabIdx(Math.max(0, Math.min(activeTabIdx, tickets.length - 2)))
  }

  // ── ESTADO DEL FORM ────────────────────────────────────
  const [q, setQ] = useState('')
  const [categoria, setCategoria] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [cobroOpen, setCobroOpen] = useState(false)
  const [mobileTicketOpen, setMobileTicketOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Atajos de teclado + auto-focus permanente para el escáner físico
  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isTyping = ['INPUT', 'TEXTAREA'].includes(target.tagName)
      if (e.key === '/' && !isTyping) { e.preventDefault(); inputRef.current?.focus() }
      if (e.key === 'Escape' && !isTyping) setQ('')
      if (e.key === 'F2') { e.preventDefault(); agregarTab() }
      // 🔫 Si el usuario empieza a teclear (incluido el escáner físico)
      //    y NO está en otro input, re-enfoca el buscador automáticamente
      const isDigit = /^[0-9]$/.test(e.key)
      if (isDigit && !isTyping && !cobroOpen && !scannerOpen) {
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cobroOpen, scannerOpen])

  // Re-focus al input cuando se cierra el sheet de cobro (mantiene escáner listo)
  useEffect(() => {
    if (!cobroOpen && !scannerOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [cobroOpen, scannerOpen])

  // Búsqueda
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

  // Favoritos del día: productos más vendidos hoy (quick reorder)
  const favoritos = useMemo(() => {
    if (q.trim() || categoria) return []  // No mostrar favoritos si está filtrando
    if (favoritosIds.length === 0) return []
    return favoritosIds
      .map(id => productos.find(p => p.id === id))
      .filter((p): p is Producto => !!p)
  }, [favoritosIds, productos, q, categoria])

  const itemsCalc = items.map(calcularItem)
  const tot = calcularTotalesVenta(itemsCalc)

  // ── ACCIONES DEL CARRITO ───────────────────────────────
  const addProducto = (p: Producto) => {
    const ix = items.findIndex(i => i.producto_id === p.id)
    if (ix >= 0) {
      setItems(prev => prev.map((it, i) => i === ix ? { ...it, cantidad: it.cantidad + 1 } : it))
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
    toast.success('✓ Agregado', p.nombre.slice(0, 40))
    inputRef.current?.focus()
  }

  const cambiarCantidad = (idx: number, delta: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: Math.max(0.001, it.cantidad + delta) } : it))
  }

  const setCantidad = (idx: number, n: number) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: Math.max(0.001, n) } : it))
  }

  const quitarItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const limpiarTicketActivo = () => {
    if (items.length === 0) return
    if (!confirm(`¿Vaciar ${tickets[activeTabIdx].nombre}? Se quitarán ${items.length} productos.`)) return
    setItems([])
    setQ('')
  }

  const onScanResult = (code: string) => {
    const found = productos.find(p => p.codigo_barras === code)
    if (found) {
      addProducto(found)
    } else {
      toast.error('No encontrado', `Código: ${code}`)
    }
  }

  const iniciarCobro = () => {
    if (items.length === 0) return toast.error('Falta', 'Agrega productos al ticket')
    if (!negocio) return toast.error('Sin negocio', 'Crea Cvu Pharmacy local')
    if (cuentas.length === 0) return toast.error('Sin cuentas', 'Crea cuentas activas en MXN')
    setCobroOpen(true)
  }

  // ── VALIDACIONES PREVIAS ───────────────────────────────
  if (!negocio) {
    return <PrerequisitoError mensaje="Falta el negocio Cvu Pharmacy local" detalle="El POS solo opera en ese negocio." tema={tema} />
  }
  if (cuentas.length === 0) {
    return <PrerequisitoError mensaje="No hay cuentas activas en MXN" detalle="Necesitas al menos una para asignar los ingresos." tema={tema} />
  }

  // ── PALETA POR TEMA ────────────────────────────────────
  const T = tema === 'light' ? {
    bgBase: '#ffffff', bgHeader: '#fafafa', bgCard: '#ffffff', bgInput: '#f4f4f5',
    border: '#e4e4e7', borderStrong: '#d4d4d8',
    text: '#0a0a0a', textMuted: '#71717a', textSubtle: '#a1a1aa',
    accent: '#dc2626', accentBg: '#fef2f2', accentBorder: '#fecaca',
    headerGrad: 'linear-gradient(135deg, #fef2f2, #fafafa, #ffffff)',
  } : {
    bgBase: '#0a0a0a', bgHeader: '#0a0a0a', bgCard: '#18181b', bgInput: '#27272a',
    border: '#27272a', borderStrong: '#3f3f46',
    text: '#fafafa', textMuted: '#a1a1aa', textSubtle: '#71717a',
    accent: '#10b981', accentBg: 'rgba(16,185,129,0.08)', accentBorder: 'rgba(16,185,129,0.3)',
    headerGrad: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(6,182,212,0.05), transparent)',
  }

  return (
    <div
      data-tema={tema}
      className="fixed inset-0 flex flex-col overflow-hidden"
      style={{ height: '100dvh', background: T.bgBase, color: T.text }}
    >
      {/* Header */}
      <header
        className="px-3 py-2.5 flex items-center gap-2.5 shrink-0 border-b"
        style={{ borderColor: T.border, background: T.headerGrad, backdropFilter: 'blur(10px)' }}
      >
        {/* Logo — versión cajera light desktop: usa el logo CVU oficial.
             En otros casos (mobile, dark, admin): logo cuadrado con emoji */}
        {esCajera && tema === 'light' ? (
          <>
            {/* Logo CVU oficial — solo desktop */}
            <div className="hidden md:flex items-center shrink-0 py-1">
              <CvuLogo height={48} />
            </div>
            {/* En mobile cajera light: cuadrado rojo */}
            <div
              className="md:hidden h-11 w-11 rounded-xl inline-flex items-center justify-center shrink-0 ring-1 ring-black/5 shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #ef4444, #dc2626, #b91c1c)',
                boxShadow: '0 4px 20px rgba(239,68,68,0.35)',
              }}
            >
              <span className="text-xl filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]">❤️</span>
            </div>
            <div className="min-w-0 leading-tight md:hidden">
              <p className="text-base font-black truncate tracking-tight inline-flex items-center gap-1.5" style={{ color: T.text }}>
                CVU <span style={{ color: T.accent }}>Pharmacy</span>
              </p>
              <p className="text-[10px] truncate inline-flex items-center gap-1" style={{ color: T.textMuted }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: T.accent }} />
                {userNombre} · {new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
              </p>
            </div>
            {/* Indicador sutil con nombre cajera en desktop */}
            <div className="hidden md:flex flex-col leading-tight ml-2">
              <p className="text-[10px] truncate inline-flex items-center gap-1" style={{ color: T.textMuted }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: T.accent }} />
                {userNombre} · {new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
              </p>
            </div>
          </>
        ) : (
          <>
            <div
              className="h-11 w-11 rounded-xl inline-flex items-center justify-center shrink-0 ring-1 ring-white/20 shadow-lg"
              style={{
                background: tema === 'light'
                  ? 'linear-gradient(135deg, #dc2626, #b91c1c, #991b1b)'
                  : 'linear-gradient(135deg, #10b981, #34d399, #06b6d4)',
                boxShadow: tema === 'light' ? '0 4px 20px rgba(220,38,38,0.35)' : '0 4px 20px rgba(16,185,129,0.4)',
              }}
            >
              <span className="text-xl filter drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">💊</span>
            </div>
            <div className="min-w-0 leading-tight">
              <p className="text-base font-black truncate tracking-tight inline-flex items-center gap-1.5" style={{ color: T.text }}>
                CVU <span style={{ color: T.accent }}>Pharmacy</span>
              </p>
              <p className="text-[10px] truncate inline-flex items-center gap-1" style={{ color: T.textMuted }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: T.accent }} />
                {userNombre} · {new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
              </p>
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {/* Indicador estado de conexión (online/offline + cola) */}
          <ConnectionBadge
            online={conn.online}
            colaSize={conn.colaSize}
            sincronizando={conn.sincronizando}
            onSync={conn.sync}
            tema={tema}
            realtimeActivo={realtimeActivo}
          />
          {/* Toggle tema */}
          <button
            type="button"
            onClick={() => setTema(t => t === 'light' ? 'dark' : 'light')}
            className="h-9 w-9 rounded-lg inline-flex items-center justify-center transition-all active:scale-95"
            style={{
              background: tema === 'light' ? '#0a0a0a' : '#fafafa',
              color: tema === 'light' ? '#fafafa' : '#0a0a0a',
            }}
            title="Cambiar tema"
          >
            {tema === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          {/* Botón Checador — siempre visible para que Tania lo encuentre */}
          <Link
            href="/checador"
            className="h-9 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 active:scale-95 transition-colors"
            style={{
              background: tema === 'light' ? '#fef3c7' : 'rgba(251,191,36,0.15)',
              border: `1px solid ${tema === 'light' ? '#fde68a' : 'rgba(251,191,36,0.3)'}`,
              color: tema === 'light' ? '#92400e' : '#fbbf24',
            }}
            title="Checar entrada/salida"
          >
            <Clock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Checar</span>
          </Link>
          <Link
            href="/pos/corte"
            className="h-9 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 active:scale-95 transition-colors"
            style={{
              background: T.accentBg,
              border: `1px solid ${T.accentBorder}`,
              color: T.accent,
            }}
            title="Corte de caja"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Corte</span>
          </Link>
          <Link
            href="/login"
            className="h-9 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 active:scale-95 transition-colors"
            style={{
              background: tema === 'light' ? '#fef2f2' : 'rgba(244,63,94,0.15)',
              border: `1px solid ${tema === 'light' ? '#fecaca' : 'rgba(244,63,94,0.3)'}`,
              color: tema === 'light' ? '#b91c1c' : '#fca5a5',
            }}
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

      {/* Tabs (solo si hay >1 ticket o siempre visibles desktop) */}
      <div
        className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto shrink-0 border-b"
        style={{ borderColor: T.border, background: T.bgHeader }}
      >
        {tickets.map((t, i) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTabIdx(i)}
            className={cn(
              'shrink-0 h-8 px-2.5 rounded-md text-[11px] font-bold inline-flex items-center gap-1.5 transition-all',
              i === activeTabIdx ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
            )}
            style={{
              background: i === activeTabIdx ? T.accent : T.bgInput,
              color: i === activeTabIdx ? '#ffffff' : T.text,
              border: `1px solid ${i === activeTabIdx ? T.accent : T.border}`,
            }}
          >
            {t.nombre} {t.items.length > 0 && `(${t.items.length})`}
            {tickets.length > 1 && i === activeTabIdx && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); cerrarTab(i) }}
                className="ml-1 hover:opacity-80 cursor-pointer inline-flex"
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={agregarTab}
          className="shrink-0 h-8 w-8 rounded-md inline-flex items-center justify-center font-bold active:scale-95"
          style={{ background: T.bgInput, color: T.textMuted, border: `1px dashed ${T.borderStrong}` }}
          title="Nuevo ticket (F2)"
        >
          <Plus className="h-4 w-4" />
        </button>
        <span className="ml-auto text-[9px] hidden sm:inline" style={{ color: T.textSubtle }}>
          <kbd className="font-mono">F2</kbd> nuevo · <kbd className="font-mono">/</kbd> busca
        </span>
      </div>

      {/* Layout principal */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* COLUMNA IZQUIERDA: PRODUCTOS */}
        <div
          className="flex-1 flex flex-col overflow-hidden md:border-r"
          style={{ borderColor: T.border }}
        >
          {/* Barra de búsqueda + scanner */}
          <div
            className="p-3 border-b space-y-2"
            style={{ borderColor: T.border, background: tema === 'light' ? '#fafafa' : 'rgba(10,10,10,0.6)' }}
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: T.textMuted }} />
                <input
                  ref={inputRef}
                  type="text"
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  onKeyDown={e => {
                    // 🔫 Enter del escáner físico (USB pistola/lápiz)
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const codigo = q.trim()
                      if (codigo.length < 3) return
                      // 1. Match exacto por código de barras
                      let prod = productos.find(p => p.codigo_barras === codigo)
                      // 2. Si no, primer match en búsqueda (sirve para escribir parcial)
                      if (!prod && productosFiltrados.length > 0) prod = productosFiltrados[0]
                      if (prod) {
                        addProducto(prod)
                      } else {
                        toast.error('No encontrado', codigo.slice(0, 30))
                        setQ('')
                      }
                    }
                  }}
                  placeholder="Escanear código o buscar producto…"
                  autoFocus
                  className="w-full h-12 pl-10 pr-9 rounded-xl text-base focus:outline-none focus:ring-2"
                  style={{
                    background: T.bgInput,
                    border: `1px solid ${T.border}`,
                    color: T.text,
                  }}
                />
                {q && (
                  <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="h-4 w-4" style={{ color: T.textMuted }} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="h-12 w-12 rounded-xl active:scale-95 inline-flex items-center justify-center shrink-0 shadow-md"
                style={{ background: T.accent, color: '#ffffff' }}
                title="Escanear código"
              >
                <ScanLine className="h-5 w-5" />
              </button>
            </div>

            {/* Chips categorías */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              <CategoryChip activa={!categoria} onClick={() => setCategoria('')} tema={tema} T={T}>
                Todas ({productos.length})
              </CategoryChip>
              {categorias.slice(0, 12).map(c => {
                const count = productos.filter(p => p.categoria === c).length
                const em = EMOJI_CAT[c] ?? '📦'
                return (
                  <CategoryChip
                    key={c}
                    activa={categoria === c}
                    onClick={() => setCategoria(categoria === c ? '' : c)}
                    tema={tema}
                    T={T}
                  >
                    <span>{em}</span>{c} ({count})
                  </CategoryChip>
                )
              })}
            </div>
          </div>

          {/* Grid productos — pb extra en mobile para que no tape el aside */}
          <div
            className="flex-1 overflow-y-auto p-3 pb-24 md:pb-3"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {/* Favoritos del día — quick reorder */}
            {favoritos.length > 0 && (
              <div className="mb-3 space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider font-bold inline-flex items-center gap-1.5" style={{ color: T.textMuted }}>
                  ⚡ Favoritos de hoy · Tap rápido
                </p>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {favoritos.map(p => (
                    <button
                      key={`fav-${p.id}`}
                      type="button"
                      onClick={() => addProducto(p)}
                      className="shrink-0 rounded-xl px-2.5 py-1.5 inline-flex items-center gap-1.5 active:scale-95 transition-all"
                      style={{
                        background: tema === 'light' ? '#fef3c7' : 'rgba(251,191,36,0.12)',
                        border: `1px solid ${tema === 'light' ? '#fde68a' : 'rgba(251,191,36,0.3)'}`,
                        color: tema === 'light' ? '#92400e' : '#fbbf24',
                      }}
                    >
                      <span className="text-[11px] font-bold truncate max-w-[140px]">{p.nombre}</span>
                      <span className="text-[10px] font-bold tabular-nums opacity-80">${p.precio_mxn}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {productosFiltrados.length === 0 ? (
              <div className="text-center py-10 text-sm" style={{ color: T.textMuted }}>
                Sin resultados {q && `para "${q}"`}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {productosFiltrados.map(p => (
                  <ProductoCard key={p.id} p={p} onTap={() => addProducto(p)} tema={tema} T={T} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: TICKET — desktop sidebar / mobile bottom-sheet */}
        <aside
          className={cn(
            'flex flex-col z-40 transition-all duration-300',
            'md:relative md:w-80 lg:w-96 md:max-h-none md:translate-y-0',
            'fixed inset-x-0 bottom-0 rounded-t-2xl md:rounded-none',
            mobileTicketOpen ? 'max-h-[80dvh]' : 'max-h-[80px]',
            'md:max-h-none'
          )}
          style={{
            background: T.bgCard,
            borderTop: `1px solid ${T.accent}`,
            borderLeft: `1px solid ${T.border}`,
            paddingBottom: 'env(safe-area-inset-bottom)',
            boxShadow: tema === 'light' ? '0 -8px 24px rgba(0,0,0,0.08)' : '0 -8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {/* Header del ticket */}
          <button
            type="button"
            onClick={() => setMobileTicketOpen(v => !v)}
            className="md:cursor-default px-3 py-2 flex items-center justify-between w-full text-left border-b"
            style={{ borderColor: T.border }}
          >
            <div className="flex items-center gap-2 flex-1">
              <ShoppingBag className="h-4 w-4 shrink-0" style={{ color: T.accent }} />
              <div>
                <p className="text-sm font-black leading-tight" style={{ color: T.text }}>
                  {tickets[activeTabIdx]?.nombre} {items.length > 0 && `· ${items.length}`}
                </p>
                <p className="text-[10px] leading-tight md:hidden" style={{ color: T.textMuted }}>
                  {items.length === 0 ? 'Tap para abrir' : `Total ${formatMoney(tot.subtotal, 'MXN')}`}
                </p>
                <p className="text-[10px] leading-tight hidden md:block" style={{ color: T.textMuted }}>
                  {items.length} item{items.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); limpiarTicketActivo() }}
                  className="h-7 px-2 rounded-md text-[10px] font-bold inline-flex items-center gap-1 active:scale-95 cursor-pointer"
                  style={{
                    background: tema === 'light' ? '#fef2f2' : 'rgba(244,63,94,0.15)',
                    border: `1px solid ${tema === 'light' ? '#fecaca' : 'rgba(244,63,94,0.3)'}`,
                    color: tema === 'light' ? '#b91c1c' : '#fca5a5',
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                  Vaciar
                </span>
              )}
              <ChevronUp
                className={cn('h-5 w-5 md:hidden transition-transform', mobileTicketOpen && 'rotate-180')}
                style={{ color: T.textMuted }}
              />
            </div>
          </button>

          {/* Items */}
          <div
            className={cn(
              'flex-1 overflow-y-auto p-2 space-y-1.5',
              !mobileTicketOpen && 'hidden md:block'
            )}
            style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
          >
            {items.length === 0 ? (
              <div className="text-center py-12 text-sm" style={{ color: T.textSubtle }}>
                <ShoppingBag className="h-10 w-10 mx-auto mb-2 opacity-30" />
                Carrito vacío
              </div>
            ) : (
              itemsCalc.map((it, idx) => (
                <div key={idx} className="rounded-lg p-2" style={{ background: T.bgInput, border: `1px solid ${T.border}` }}>
                  <div className="flex items-start gap-2 mb-1.5">
                    <p className="text-xs font-semibold flex-1 leading-tight line-clamp-2" style={{ color: T.text }}>
                      {it.nombre_snapshot}
                    </p>
                    <button
                      type="button"
                      onClick={() => quitarItem(idx)}
                      className="h-6 w-6 rounded inline-flex items-center justify-center shrink-0"
                      style={{ color: tema === 'light' ? '#dc2626' : '#fca5a5' }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="inline-flex items-center rounded-md" style={{ background: T.bgCard, border: `1px solid ${T.border}` }}>
                      <button onClick={() => cambiarCantidad(idx, -1)} className="h-7 w-7 inline-flex items-center justify-center" style={{ color: T.text }}>
                        <Minus className="h-3 w-3" />
                      </button>
                      <input
                        type="number"
                        value={it.cantidad}
                        step="1"
                        onChange={e => setCantidad(idx, Number(e.target.value) || 1)}
                        className="w-10 h-7 bg-transparent text-center text-xs font-bold tabular-nums focus:outline-none"
                        style={{ color: T.text }}
                      />
                      <button onClick={() => cambiarCantidad(idx, 1)} className="h-7 w-7 inline-flex items-center justify-center" style={{ color: T.text }}>
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="text-[10px]" style={{ color: T.textMuted }}>
                      × {formatMoney(it.precio_unitario_mxn, 'MXN')}
                    </span>
                    <p className="ml-auto text-sm font-bold tabular-nums" style={{ color: T.accent }}>
                      {formatMoney(it.subtotal_mxn, 'MXN')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Total + Botón cobrar */}
          <div
            className={cn(
              'p-3 space-y-2 border-t',
              !mobileTicketOpen && 'hidden md:block'
            )}
            style={{
              borderColor: T.border,
              background: T.bgCard,
              paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
            }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-wider font-bold" style={{ color: T.textMuted }}>Total</span>
              <AnimatedTotal value={tot.subtotal} color={T.accent} />
            </div>
            <button
              type="button"
              onClick={iniciarCobro}
              disabled={items.length === 0}
              className="w-full h-14 rounded-xl text-white font-black text-base inline-flex items-center justify-center gap-2 disabled:opacity-30 shadow-lg active:scale-[0.98] transition-all"
              style={{
                background: tema === 'light'
                  ? 'linear-gradient(90deg, #dc2626, #b91c1c)'
                  : 'linear-gradient(90deg, #10b981, #06b6d4)',
                boxShadow: tema === 'light' ? '0 8px 24px rgba(220,38,38,0.4)' : '0 8px 24px rgba(16,185,129,0.4)',
              }}
            >
              💵 COBRAR
            </button>
          </div>

          {/* Bar colapsada en mobile cuando hay items */}
          {items.length > 0 && !mobileTicketOpen && (
            <button
              type="button"
              onClick={() => setMobileTicketOpen(true)}
              className="md:hidden absolute inset-x-0 bottom-0 mx-2 mb-2 h-12 rounded-xl text-white font-black inline-flex items-center justify-between px-4 shadow-lg active:scale-[0.98]"
              style={{
                background: tema === 'light'
                  ? 'linear-gradient(90deg, #dc2626, #b91c1c)'
                  : 'linear-gradient(90deg, #10b981, #06b6d4)',
                boxShadow: tema === 'light' ? '0 8px 20px rgba(220,38,38,0.45)' : '0 8px 20px rgba(16,185,129,0.45)',
                marginBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
              }}
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

      {/* Backdrop mobile */}
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
          rate={rate}
          onOfflineQueued={() => conn.refrescarCola()}
          onSuccess={() => {
            setItems([])
            setCobroOpen(false)
            setMobileTicketOpen(false)
            inputRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────
// Subcomponentes
// ────────────────────────────────────────────────────────

function ProductoCard({ p, onTap, tema, T }: { p: Producto; onTap: () => void; tema: 'light' | 'dark'; T: Record<string, string> }) {
  const emoji = p.categoria === 'Choco' ? '📦' : (EMOJI_CAT[p.categoria ?? ''] ?? '📦')
  const sinStock = p.stock <= 0
  return (
    <button
      type="button"
      onClick={onTap}
      className="text-left rounded-xl overflow-hidden active:scale-[0.96] transition-all"
      style={{
        background: T.bgCard,
        border: `1px solid ${sinStock ? (tema === 'light' ? '#fecaca' : 'rgba(244,63,94,0.3)') : T.border}`,
        opacity: sinStock ? 0.6 : 1,
        boxShadow: tema === 'light' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
      }}
    >
      <div
        className="relative aspect-square flex items-center justify-center"
        style={{ background: tema === 'light' ? '#f9fafb' : 'linear-gradient(to bottom right, rgba(39,39,42,0.6), #0a0a0a)' }}
      >
        {p.foto_signed_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={p.foto_signed_url} alt={p.nombre} className="w-full h-full object-cover" />
        ) : (
          <span className="text-4xl opacity-50">{emoji}</span>
        )}
        <span
          className="absolute top-1.5 right-1.5 inline-flex items-center px-1.5 h-5 rounded-full text-[9px] font-bold tabular-nums"
          style={{
            background: sinStock
              ? (tema === 'light' ? '#fee2e2' : 'rgba(244,63,94,0.2)')
              : p.stock <= 3
                ? (tema === 'light' ? '#fef3c7' : 'rgba(251,191,36,0.2)')
                : (tema === 'light' ? '#dcfce7' : 'rgba(16,185,129,0.2)'),
            color: sinStock
              ? (tema === 'light' ? '#991b1b' : '#fca5a5')
              : p.stock <= 3
                ? (tema === 'light' ? '#92400e' : '#fbbf24')
                : (tema === 'light' ? '#166534' : '#10b981'),
            border: `1px solid ${sinStock
              ? (tema === 'light' ? '#fecaca' : 'rgba(244,63,94,0.4)')
              : p.stock <= 3
                ? (tema === 'light' ? '#fde68a' : 'rgba(251,191,36,0.4)')
                : (tema === 'light' ? '#bbf7d0' : 'rgba(16,185,129,0.4)')}`,
          }}
        >
          {p.stock}
        </span>
      </div>
      <div className="p-1.5 space-y-0.5">
        <p className="text-[11px] font-semibold leading-tight line-clamp-2 min-h-[28px]" style={{ color: T.text }}>{p.nombre}</p>
        <p className="text-sm font-black tabular-nums leading-none" style={{ color: T.accent }}>
          {formatMoney(p.precio_mxn, 'MXN')}
        </p>
      </div>
    </button>
  )
}

function CategoryChip({ activa, onClick, tema, T, children }: {
  activa: boolean; onClick: () => void; tema: 'light' | 'dark'; T: Record<string, string>; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 h-7 px-2.5 rounded-full text-[10px] transition-all inline-flex items-center gap-1"
      style={{
        background: activa ? T.accent : 'transparent',
        color: activa ? '#ffffff' : T.textMuted,
        border: `1px solid ${activa ? T.accent : T.border}`,
        boxShadow: activa
          ? (tema === 'light' ? '0 2px 8px rgba(220,38,38,0.25)' : '0 2px 8px rgba(16,185,129,0.25)')
          : 'none',
      }}
    >
      {children}
    </button>
  )
}

function ConnectionBadge({
  online, colaSize, sincronizando, onSync, tema,
}: {
  online: boolean
  colaSize: number
  sincronizando: boolean
  onSync: () => void
  tema: 'light' | 'dark'
  realtimeActivo: boolean
}) {
  // 4 estados visuales:
  // 1. Online + 0 pendientes → "● Live" verde
  // 2. Online + sincronizando → "↻ Sync" cyan
  // 3. Offline → "● Offline" rojo + (N) si hay pendientes
  // 4. Online + N pendientes → "⏳ N pendientes (tap sync)" ámbar
  if (sincronizando) {
    return (
      <span
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[9px] font-bold uppercase tracking-wider"
        style={{
          background: tema === 'light' ? '#dbeafe' : 'rgba(6,182,212,0.15)',
          color: tema === 'light' ? '#1e40af' : '#67e8f9',
          border: `1px solid ${tema === 'light' ? '#bfdbfe' : 'rgba(6,182,212,0.3)'}`,
        }}
      >
        <svg className="h-2.5 w-2.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
          <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        Sync
      </span>
    )
  }
  if (!online) {
    return (
      <span
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[9px] font-bold uppercase tracking-wider"
        style={{
          background: tema === 'light' ? '#fee2e2' : 'rgba(244,63,94,0.15)',
          color: tema === 'light' ? '#991b1b' : '#fca5a5',
          border: `1px solid ${tema === 'light' ? '#fecaca' : 'rgba(244,63,94,0.3)'}`,
        }}
        title="Sin conexión — las ventas se guardan localmente"
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: tema === 'light' ? '#dc2626' : '#f87171' }} />
        Offline {colaSize > 0 && `(${colaSize})`}
      </span>
    )
  }
  if (colaSize > 0) {
    return (
      <button
        type="button"
        onClick={onSync}
        className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[9px] font-bold uppercase tracking-wider hover:opacity-90 active:scale-95"
        style={{
          background: tema === 'light' ? '#fef3c7' : 'rgba(251,191,36,0.15)',
          color: tema === 'light' ? '#92400e' : '#fbbf24',
          border: `1px solid ${tema === 'light' ? '#fde68a' : 'rgba(251,191,36,0.3)'}`,
        }}
        title={`${colaSize} venta${colaSize === 1 ? '' : 's'} sin sincronizar — tap para reintentar`}
      >
        ⏳ {colaSize} pendiente{colaSize === 1 ? '' : 's'}
      </button>
    )
  }
  return (
    <span
      className="hidden sm:inline-flex items-center gap-1 h-7 px-2 rounded-md text-[9px] font-bold uppercase tracking-wider"
      style={{
        background: tema === 'light' ? '#dcfce7' : 'rgba(16,185,129,0.15)',
        color: tema === 'light' ? '#166534' : '#34d399',
        border: `1px solid ${tema === 'light' ? '#bbf7d0' : 'rgba(16,185,129,0.3)'}`,
      }}
      title="Conectado en tiempo real"
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: tema === 'light' ? '#16a34a' : '#10b981' }}></span>
        <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: tema === 'light' ? '#16a34a' : '#10b981' }}></span>
      </span>
      Live
    </span>
  )
}

/** Total animado con tween cuando cambia (smooth count) */
function AnimatedTotal({ value, color }: { value: number; color: string }) {
  const [display, setDisplay] = useState(value)
  const [pulse, setPulse] = useState(false)
  const prevRef = useRef(value)

  useEffect(() => {
    if (value === prevRef.current) return
    const from = prevRef.current
    const to = value
    const duration = 500
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(from + (to - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else prevRef.current = to
    }
    raf = requestAnimationFrame(tick)
    if (to > from) {
      setPulse(true)
      setTimeout(() => setPulse(false), 400)
    }
    return () => cancelAnimationFrame(raf)
  }, [value])

  return (
    <span
      className={cn('text-2xl font-black tabular-nums transition-transform', pulse && 'scale-110')}
      style={{ color }}
    >
      ${Math.round(display).toLocaleString('es-MX', { minimumFractionDigits: 0 })}.{(display % 1).toFixed(2).slice(2)}
    </span>
  )
}

function PrerequisitoError({ mensaje, detalle, tema }: { mensaje: string; detalle: string; tema: 'light' | 'dark' }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: tema === 'light' ? '#ffffff' : '#0a0a0a' }}
    >
      <div
        className="rounded-2xl p-6 max-w-md space-y-3 text-center"
        style={{
          background: tema === 'light' ? '#fef2f2' : 'rgba(244,63,94,0.05)',
          border: `1px solid ${tema === 'light' ? '#fecaca' : 'rgba(244,63,94,0.3)'}`,
        }}
      >
        <AlertTriangle className="h-10 w-10 mx-auto" style={{ color: tema === 'light' ? '#dc2626' : '#fca5a5' }} />
        <p className="text-lg font-bold" style={{ color: tema === 'light' ? '#991b1b' : '#fecaca' }}>{mensaje}</p>
        <p className="text-sm" style={{ color: tema === 'light' ? '#dc2626' : 'rgba(244,63,94,0.8)' }}>{detalle}</p>
      </div>
    </div>
  )
}
