/**
 * Reportes profundos de ganancia (Sprint 9).
 *
 * Secciones:
 *   1. Tendencia mensual últimos 12 meses (gráfico de barras + línea)
 *   2. Top productos por ganancia (las "joyas")
 *   3. Productos con peor margen (subir precio o descontinuar)
 *   4. Slow-movers: stock alto sin movimiento (capital atrapado)
 *   5. Comparativo de ganancia por negocio
 *   6. Margen por categoría
 *
 * Defensive: si venta_items no existe, muestra empty state.
 */

import Link from 'next/link'
import { ChevronLeft, TrendingUp, AlertTriangle, Snowflake, Award, Package } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { cn, formatMoney } from '@/lib/utils'
import { TendenciaChart } from '@/components/reportes/tendencia-chart'

export const dynamic = 'force-dynamic'

export default async function ReportesGananciaPage() {
  const admin = createAdminClient()

  // ── 1. ¿La tabla venta_items existe? ──────────────────────
  let tablaExiste = true
  const probe = await admin.from('venta_items').select('id').limit(1)
  if (probe.error) tablaExiste = false

  if (!tablaExiste) {
    return (
      <div className="px-4 pt-4 pb-24 space-y-4 max-w-3xl mx-auto">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-zinc-400">
          <ChevronLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <header>
          <h1 className="text-2xl font-black heading-gradient">Reportes de ganancia</h1>
        </header>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-300 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-200">Aplica la migración 0043</p>
            <p className="text-xs text-amber-200/80 mt-1">
              La tabla <code className="font-mono">venta_items</code> aún no existe. Corre el SQL de{' '}
              <code className="font-mono">supabase/migrations/0043_venta_items.sql</code> en Supabase Dashboard.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── 2. Tendencia mensual últimos 12 meses ──────────────────
  const hoy = new Date()
  hoy.setDate(1)
  hoy.setHours(0, 0, 0, 0)
  const desde12m = new Date(hoy)
  desde12m.setMonth(desde12m.getMonth() - 11)
  const desde12mStr = desde12m.toISOString().slice(0, 10)

  const { data: ventas12m } = await admin
    .from('transacciones')
    .select('fecha, monto, ganancia_estimada_mxn, costo_total_mxn')
    .eq('tiene_items', true)
    .eq('tipo', 'ingreso')
    .gte('fecha', desde12mStr)
    .order('fecha')
  const v12 = (ventas12m ?? []) as Array<{ fecha: string; monto: number; ganancia_estimada_mxn: number | null; costo_total_mxn: number | null }>

  // Agrupar por YYYY-MM
  type Mes = { key: string; label: string; ingresos: number; costo: number; ganancia: number }
  const meses: Mes[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(desde12m)
    d.setMonth(d.getMonth() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('es-MX', { month: 'short' }).replace('.', '')
    meses.push({ key, label, ingresos: 0, costo: 0, ganancia: 0 })
  }
  for (const t of v12) {
    const key = t.fecha.slice(0, 7)
    const m = meses.find(x => x.key === key)
    if (!m) continue
    m.ingresos += Number(t.monto ?? 0)
    m.costo += Number(t.costo_total_mxn ?? 0)
    m.ganancia += Number(t.ganancia_estimada_mxn ?? 0)
  }
  const totalAnual = meses.reduce((s, m) => s + m.ganancia, 0)
  const promedioMensual = totalAnual / 12

  // ── 3. Top productos por ganancia + peor margen ──────────────
  const desde90 = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const { data: itemsAll } = await admin
    .from('venta_items')
    .select('producto_id, nombre_snapshot, categoria_snapshot, cantidad, subtotal_mxn, ganancia_mxn, costo_unitario_snapshot_mxn, precio_unitario_mxn')
    .gte('created_at', desde90)
  type ItemRow = {
    producto_id: string | null
    nombre_snapshot: string
    categoria_snapshot: string | null
    cantidad: number
    subtotal_mxn: number
    ganancia_mxn: number | null
    costo_unitario_snapshot_mxn: number | null
    precio_unitario_mxn: number
  }
  const items = (itemsAll ?? []) as ItemRow[]

  // Agrega por producto
  type Agg = {
    nombre: string; categoria: string | null
    unidades: number; ingresos: number; ganancia: number; margen_pct: number | null
  }
  const aggMap = new Map<string, Agg>()
  for (const it of items) {
    const key = it.nombre_snapshot
    const prev = aggMap.get(key) ?? { nombre: key, categoria: it.categoria_snapshot, unidades: 0, ingresos: 0, ganancia: 0, margen_pct: null }
    prev.unidades += Number(it.cantidad ?? 0)
    prev.ingresos += Number(it.subtotal_mxn ?? 0)
    prev.ganancia += Number(it.ganancia_mxn ?? 0)
    aggMap.set(key, prev)
  }
  const aggArr = Array.from(aggMap.values()).map(a => ({
    ...a,
    margen_pct: a.ingresos > 0 ? (a.ganancia / a.ingresos) * 100 : null,
  }))

  const topGanancia = [...aggArr].sort((a, b) => b.ganancia - a.ganancia).slice(0, 5)
  const peorMargen = [...aggArr]
    .filter(a => a.margen_pct != null && a.unidades >= 1)
    .sort((a, b) => (a.margen_pct ?? 999) - (b.margen_pct ?? 999))
    .slice(0, 5)

  // ── 4. Slow-movers: stock alto sin movimientos en 60+ días ──
  type Prod = { id: string; nombre: string; stock: number; precio_mxn: number; costo_mxn: number | null; categoria: string | null }
  const { data: prodAll } = await admin
    .from('inventario_productos')
    .select('id, nombre, stock, precio_mxn, costo_mxn, categoria')
    .eq('activo', true)
    .gt('stock', 5)  // solo stock > 5 vale la pena flag
  const productos = (prodAll ?? []) as Prod[]

  const desde60 = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const { data: movs60 } = await admin
    .from('inventario_movimientos')
    .select('producto_id')
    .in('tipo', ['venta', 'salida'])
    .gte('created_at', desde60)
  const productosConVenta60d = new Set((movs60 ?? []).map(m => m.producto_id as string))

  const slowMovers = productos
    .filter(p => !productosConVenta60d.has(p.id))
    .map(p => ({
      id: p.id,
      nombre: p.nombre,
      stock: p.stock,
      categoria: p.categoria,
      valor_atrapado: (p.costo_mxn ?? p.precio_mxn * 0.6) * p.stock,
    }))
    .sort((a, b) => b.valor_atrapado - a.valor_atrapado)
    .slice(0, 8)
  const totalAtrapado = slowMovers.reduce((s, p) => s + p.valor_atrapado, 0)

  // ── 5. Comparativo por negocio (último mes) ──────────────────
  const desdeMes = new Date()
  desdeMes.setDate(1)
  desdeMes.setHours(0, 0, 0, 0)
  const desdeMesStr = desdeMes.toISOString().slice(0, 10)

  const { data: porNegocio } = await admin
    .from('transacciones')
    .select('negocio_id, monto, ganancia_estimada_mxn, negocios(nombre, tipo)')
    .eq('tiene_items', true)
    .eq('tipo', 'ingreso')
    .gte('fecha', desdeMesStr)
  type NegAgg = { nombre: string; tipo: string; ingresos: number; ganancia: number }
  const negMap = new Map<string, NegAgg>()
  for (const t of (porNegocio ?? []) as unknown as Array<{ negocio_id: string | null; monto: number; ganancia_estimada_mxn: number | null; negocios: { nombre: string; tipo: string } | { nombre: string; tipo: string }[] | null }>) {
    if (!t.negocio_id) continue
    const negObj = Array.isArray(t.negocios) ? t.negocios[0] : t.negocios
    const key = t.negocio_id
    const prev = negMap.get(key) ?? { nombre: negObj?.nombre ?? '—', tipo: negObj?.tipo ?? 'general', ingresos: 0, ganancia: 0 }
    prev.ingresos += Number(t.monto ?? 0)
    prev.ganancia += Number(t.ganancia_estimada_mxn ?? 0)
    negMap.set(key, prev)
  }
  const negociosArr = Array.from(negMap.values())
    .map(n => ({ ...n, margen_pct: n.ingresos > 0 ? (n.ganancia / n.ingresos) * 100 : 0 }))
    .sort((a, b) => b.ganancia - a.ganancia)

  // ── 6. Margen por categoría ──────────────────────────────────
  type CatAgg = { categoria: string; ingresos: number; ganancia: number; unidades: number }
  const catMap = new Map<string, CatAgg>()
  for (const it of items) {
    const key = it.categoria_snapshot ?? '(sin categoría)'
    const prev = catMap.get(key) ?? { categoria: key, ingresos: 0, ganancia: 0, unidades: 0 }
    prev.ingresos += Number(it.subtotal_mxn ?? 0)
    prev.ganancia += Number(it.ganancia_mxn ?? 0)
    prev.unidades += Number(it.cantidad ?? 0)
    catMap.set(key, prev)
  }
  const categoriasArr = Array.from(catMap.values())
    .map(c => ({ ...c, margen_pct: c.ingresos > 0 ? (c.ganancia / c.ingresos) * 100 : 0 }))
    .sort((a, b) => b.ganancia - a.ganancia)

  // ── Empty state ─────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="px-4 pt-4 pb-24 space-y-4 max-w-3xl mx-auto">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-zinc-400">
          <ChevronLeft className="h-4 w-4" /> Dashboard
        </Link>
        <header>
          <h1 className="text-2xl font-black heading-gradient">Reportes de ganancia</h1>
        </header>
        <div className="rounded-2xl border border-dashed border-cyan-500/30 bg-cyan-500/5 p-6 text-center space-y-3">
          <TrendingUp className="h-10 w-10 text-cyan-400 mx-auto" />
          <p className="text-base font-bold text-zinc-100">Aún sin ventas registradas</p>
          <p className="text-xs text-zinc-500">Registra ventas con productos del inventario para ver tus reportes.</p>
          <Link
            href="/transacciones/venta"
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-emerald-600 text-white text-xs font-bold"
          >
            Registrar primera venta
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 max-w-3xl mx-auto">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Dashboard
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-cyan-400" />
          Reportes de ganancia
        </h1>
        <p className="text-[11px] text-zinc-500">
          Tendencia + productos · últimos 90 días + 12 meses para comparativos
        </p>
      </header>

      {/* 1. Tendencia mensual */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Tendencia 12 meses</h2>
          <p className="text-[10px] text-zinc-500">Total {formatMoney(totalAnual, 'MXN')} · prom {formatMoney(promedioMensual, 'MXN')}/mes</p>
        </div>
        <div className="rounded-2xl border border-cyan-500/20 bg-zinc-950/40 p-3">
          <TendenciaChart data={meses} />
        </div>
      </section>

      {/* 2. Top por ganancia */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300 inline-flex items-center gap-1.5">
          <Award className="h-4 w-4 text-amber-400" />
          Top por ganancia (90d)
        </h2>
        <ul className="space-y-1.5">
          {topGanancia.map((p, idx) => (
            <li key={idx} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5">
              <div className="flex items-center gap-2">
                <span className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center text-xs font-black shrink-0',
                  idx === 0 && 'bg-amber-500/20 text-amber-200 border border-amber-500/30',
                  idx === 1 && 'bg-zinc-700/40 text-zinc-300 border border-zinc-700',
                  idx === 2 && 'bg-orange-500/20 text-orange-200 border border-orange-500/30',
                  idx > 2 && 'bg-zinc-800 text-zinc-500',
                )}>{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-zinc-100 truncate">{p.nombre}</p>
                  <p className="text-[10px] text-zinc-500">
                    {p.categoria ?? '—'} · {p.unidades}u vendidas · {p.margen_pct?.toFixed(0) ?? '?'}% margen
                  </p>
                </div>
                <p className="text-sm font-black text-emerald-300 tabular-nums shrink-0">
                  +{formatMoney(p.ganancia, 'MXN')}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* 3. Peor margen */}
      {peorMargen.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300 inline-flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-rose-400" />
            Peor margen — sube precio o descontinua
          </h2>
          <ul className="space-y-1.5">
            {peorMargen.map((p, idx) => (
              <li key={idx} className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-zinc-100 truncate">{p.nombre}</p>
                    <p className="text-[10px] text-zinc-500">
                      {p.categoria ?? '—'} · {p.unidades}u · ingresos {formatMoney(p.ingresos, 'MXN')}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-black text-rose-300 tabular-nums leading-tight">
                      {p.margen_pct?.toFixed(0) ?? '?'}%
                    </p>
                    <p className="text-[10px] text-zinc-500">margen</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 4. Slow-movers */}
      {slowMovers.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300 inline-flex items-center gap-1.5">
              <Snowflake className="h-4 w-4 text-blue-400" />
              Capital atrapado
            </h2>
            <p className="text-[10px] text-zinc-500">{formatMoney(totalAtrapado, 'MXN')} en stock parado</p>
          </div>
          <p className="text-[10px] text-zinc-500">Stock alto sin movimientos en 60+ días — considera promoción o devolución.</p>
          <ul className="space-y-1.5">
            {slowMovers.map((p) => (
              <li key={p.id} className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2.5">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-zinc-100 truncate">{p.nombre}</p>
                    <p className="text-[10px] text-zinc-500">{p.categoria ?? '—'} · stock {p.stock}</p>
                  </div>
                  <p className="text-sm font-bold text-blue-300 tabular-nums shrink-0">
                    {formatMoney(p.valor_atrapado, 'MXN')}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 5. Comparativo por negocio */}
      {negociosArr.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">
            Por negocio (este mes)
          </h2>
          <ul className="space-y-1.5">
            {negociosArr.map((n, idx) => {
              const emoji = n.tipo === 'farmacia' ? '💊' : n.tipo === 'consultorio' ? '🩺' : n.tipo === 'pagina_digital' ? '🌐' : '🏢'
              return (
                <li key={idx} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{emoji}</span>
                    <p className="text-sm font-bold text-zinc-100 flex-1 truncate">{n.nombre}</p>
                    <p className={cn(
                      'text-xs font-bold tabular-nums',
                      n.margen_pct >= 30 ? 'text-emerald-300' :
                      n.margen_pct >= 10 ? 'text-amber-300' :
                      'text-rose-300'
                    )}>
                      {n.margen_pct.toFixed(0)}%
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-500">
                    <p>Ingresos: <span className="text-zinc-200 font-bold tabular-nums">{formatMoney(n.ingresos, 'MXN')}</span></p>
                    <p>Ganancia: <span className="text-emerald-300 font-bold tabular-nums">{formatMoney(n.ganancia, 'MXN')}</span></p>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* 6. Margen por categoría */}
      {categoriasArr.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Margen por categoría (90d)</h2>
          <ul className="space-y-1">
            {categoriasArr.map((c, idx) => (
              <li key={idx} className="flex items-center gap-2 rounded-lg bg-zinc-900/40 border border-zinc-800 p-2">
                <p className="text-xs text-zinc-200 flex-1 truncate">{c.categoria}</p>
                <p className="text-[10px] text-zinc-500 tabular-nums shrink-0">{c.unidades}u</p>
                <p className="text-[10px] text-zinc-500 tabular-nums shrink-0">{formatMoney(c.ganancia, 'MXN')}</p>
                <p className={cn(
                  'text-xs font-bold tabular-nums shrink-0 w-12 text-right',
                  c.margen_pct >= 30 ? 'text-emerald-300' :
                  c.margen_pct >= 10 ? 'text-amber-300' :
                  'text-rose-300'
                )}>{c.margen_pct.toFixed(0)}%</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
