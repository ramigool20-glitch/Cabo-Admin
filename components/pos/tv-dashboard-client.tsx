'use client'

/**
 * Dashboard TV — pantalla gigante para mostrar KPIs en tiempo real.
 * Realtime de transacciones: cuando hay venta nueva, big numbers + confetti.
 * Pensado para una TV en la trastienda para ver el ritmo del negocio.
 */

import { useEffect, useState, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { TrendingUp, ShoppingBag, DollarSign, Award, Sparkles, ArrowUp } from 'lucide-react'
import { formatMoney } from '@/lib/utils'

type Venta = { id: string; monto: number; hora: string }
type TopProd = { nombre: string; unidades: number; ganancia: number }

export function TvDashboardClient({
  negocioId,
  ventasInicial,
  gananciaInicial,
  costoInicial,
  countInicial,
  ultimasVentas: ultimasInicial,
  topProductos,
}: {
  negocioId: string | null
  ventasInicial: number
  gananciaInicial: number
  costoInicial: number
  countInicial: number
  ultimasVentas: Venta[]
  topProductos: TopProd[]
}) {
  const [ventas, setVentas] = useState(ventasInicial)
  const [ganancia, setGanancia] = useState(gananciaInicial)
  const [costo, setCosto] = useState(costoInicial)
  const [count, setCount] = useState(countInicial)
  const [ultimas, setUltimas] = useState<Venta[]>(ultimasInicial)
  const [flashVenta, setFlashVenta] = useState(false)
  const [ahora, setAhora] = useState(new Date())
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const margen = ventas > 0 ? (ganancia / ventas) * 100 : 0
  const ticketPromedio = count > 0 ? ventas / count : 0

  // Reloj
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Realtime suscripción a transacciones
  useEffect(() => {
    const supa = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const channel = supa
      .channel('tv-dashboard')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transacciones' },
        (payload) => {
          const nueva = payload.new as { tipo: string; monto: number; tiene_items?: boolean; ganancia_estimada_mxn?: number; costo_total_mxn?: number; id: string; created_at: string }
          if (nueva.tipo !== 'ingreso') return
          if (!nueva.tiene_items) {
            // Espera un instante a que el trigger marque tiene_items
            return
          }
          const monto = Number(nueva.monto ?? 0)
          const g = Number(nueva.ganancia_estimada_mxn ?? 0)
          const c = Number(nueva.costo_total_mxn ?? 0)
          setVentas(v => v + monto)
          setGanancia(g_ => g_ + g)
          setCosto(c_ => c_ + c)
          setCount(n => n + 1)
          setUltimas(u => [{ id: nueva.id, monto, hora: nueva.created_at }, ...u].slice(0, 5))
          setFlashVenta(true)
          setTimeout(() => setFlashVenta(false), 2500)
          // Beep opcional
          try {
            audioRef.current?.play().catch(() => { /* user no interaccionó aún */ })
          } catch { /* ignore */ }
        },
      )
      // También escucha UPDATE para cuando el trigger recalcula
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'transacciones' },
        (payload) => {
          const updated = payload.new as { tipo: string; monto: number; tiene_items?: boolean; ganancia_estimada_mxn?: number; costo_total_mxn?: number; id: string; created_at: string }
          if (updated.tipo !== 'ingreso' || !updated.tiene_items) return
          // No volvemos a sumar (ya sumamos en INSERT). Esto es solo para refresh manual.
        },
      )
      .subscribe()

    return () => { supa.removeChannel(channel) }
  }, [])

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-black to-zinc-950 text-white overflow-hidden" style={{ height: '100dvh' }}>
      {/* Decoración de fondo */}
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />

      {/* Flash de venta nueva */}
      {flashVenta && (
        <div className="absolute inset-0 bg-emerald-500/20 animate-pulse pointer-events-none z-20" />
      )}

      {/* Header */}
      <header className="absolute top-0 inset-x-0 p-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 inline-flex items-center justify-center text-2xl shadow-lg shadow-emerald-500/40">
            💊
          </div>
          <div>
            <p className="text-2xl font-black tracking-tight">CVU Pharmacy</p>
            <p className="text-xs text-zinc-500 uppercase tracking-wider">
              Tablero en vivo · {ahora.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'long' })}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-5xl font-black tabular-nums leading-none bg-gradient-to-r from-emerald-300 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">
            {ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </p>
          <p className="text-[10px] text-zinc-500 tabular-nums uppercase tracking-wider">
            {ahora.toLocaleTimeString('es-MX', { second: '2-digit' })} seg
          </p>
        </div>
      </header>

      {/* Grid de KPIs gigantes */}
      <main className="absolute inset-0 pt-32 pb-8 px-8 grid grid-cols-2 gap-6 z-10">
        {/* Ventas hoy — el más grande */}
        <div className="rounded-3xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent p-8 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-4 right-4 opacity-20">
            <DollarSign className="h-32 w-32" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-300/80 font-bold mb-2">Ventas hoy</p>
            <BigNumber value={ventas} prefix="$" colorClass="text-emerald-300" />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <ShoppingBag className="h-4 w-4 text-emerald-300" />
            <span className="text-zinc-400">{count} ventas · ticket promedio </span>
            <span className="font-bold text-emerald-200">{formatMoney(ticketPromedio, 'MXN')}</span>
          </div>
        </div>

        {/* Ganancia hoy */}
        <div className="rounded-3xl border-2 border-cyan-500/40 bg-gradient-to-br from-cyan-500/15 via-cyan-500/5 to-transparent p-8 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-4 right-4 opacity-20">
            <TrendingUp className="h-32 w-32" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/80 font-bold mb-2">Ganancia bruta</p>
            <BigNumber value={ganancia} prefix="+$" colorClass="text-cyan-300" />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <ArrowUp className="h-4 w-4 text-cyan-300" />
            <span className="text-zinc-400">Margen </span>
            <span className="font-bold text-cyan-200 tabular-nums">{margen.toFixed(1)}%</span>
            <span className="text-zinc-500"> · COGS </span>
            <span className="font-bold text-zinc-300 tabular-nums">{formatMoney(costo, 'MXN')}</span>
          </div>
        </div>

        {/* Top productos */}
        <div className="rounded-3xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Award className="h-5 w-5 text-amber-300" />
            <p className="text-[11px] uppercase tracking-[0.3em] text-amber-300/80 font-bold">Top productos hoy</p>
          </div>
          <ul className="flex-1 space-y-2 overflow-hidden">
            {topProductos.length > 0 ? topProductos.map((p, idx) => (
              <li key={idx} className="flex items-center gap-3 rounded-xl bg-black/30 backdrop-blur p-2 border border-amber-500/10">
                <span className={`h-8 w-8 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${
                  idx === 0 ? 'bg-amber-500 text-zinc-900'
                  : idx === 1 ? 'bg-zinc-400 text-zinc-900'
                  : idx === 2 ? 'bg-orange-500 text-zinc-900'
                  : 'bg-zinc-800 text-zinc-400'
                }`}>{idx + 1}</span>
                <p className="text-sm font-bold text-zinc-100 flex-1 truncate">{p.nombre}</p>
                <span className="text-xs text-amber-200 font-bold tabular-nums">{p.unidades}u</span>
                <span className="text-xs text-emerald-300 font-bold tabular-nums">+{formatMoney(p.ganancia, 'MXN')}</span>
              </li>
            )) : (
              <p className="text-zinc-600 text-sm text-center py-4">Aún sin ventas</p>
            )}
          </ul>
        </div>

        {/* Últimas ventas tickers */}
        <div className="rounded-3xl border-2 border-purple-500/30 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-purple-300" />
            <p className="text-[11px] uppercase tracking-[0.3em] text-purple-300/80 font-bold">Últimas ventas</p>
          </div>
          <ul className="flex-1 space-y-2">
            {ultimas.length > 0 ? ultimas.map((v, idx) => (
              <li key={v.id + idx} className={`flex items-center justify-between rounded-xl backdrop-blur p-2 border ${
                idx === 0 && flashVenta ? 'bg-emerald-500/20 border-emerald-500/40 animate-pulse' : 'bg-black/30 border-purple-500/10'
              }`}>
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider">venta</p>
                  <p className="text-base font-black text-emerald-300 tabular-nums">{formatMoney(v.monto, 'MXN')}</p>
                </div>
                <p className="text-xs text-zinc-500 tabular-nums">
                  {new Date(v.hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </p>
              </li>
            )) : (
              <p className="text-zinc-600 text-sm text-center py-4">Sin ventas todavía</p>
            )}
          </ul>
        </div>
      </main>

      {/* Footer con marca */}
      <footer className="absolute bottom-0 inset-x-0 p-4 text-center z-10">
        <p className="text-[10px] text-zinc-700 tracking-widest uppercase">
          🟢 Live · Actualización en tiempo real
        </p>
      </footer>
    </div>
  )
}

/** Big number con animación de tween al cambiar */
function BigNumber({ value, prefix = '', colorClass }: { value: number; prefix?: string; colorClass: string }) {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)

  useEffect(() => {
    const from = prevRef.current
    const to = value
    const duration = 800
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(from + (to - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else prevRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])

  return (
    <p className={`text-[6rem] leading-none font-black tabular-nums tracking-tight ${colorClass}`}>
      {prefix}{Math.round(display).toLocaleString('es-MX')}
    </p>
  )
}
