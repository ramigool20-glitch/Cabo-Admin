import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Home, ArrowDownCircle, Plus, ShoppingCart, Scale, TrendingUp, ChevronRight, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha, hoyEnCabos } from '@/lib/fechas'
import { isRangoId, rangoFechas, type RangoId } from '@/lib/rangos'
import { CategoriasList } from '@/components/dashboard/categorias-list'
import { porCategoria } from '@/lib/agregaciones'
import { RangoSelector } from '@/components/dashboard/rango-selector'
import { ShoppingList } from '@/components/casa/shopping-list'
import { LiquidarRoomatesForm } from '@/components/casa/liquidar-form'
import { EmptyState } from '@/components/ui/empty-state'

export default async function CasaPage(
  { searchParams }: { searchParams: Promise<{ rango?: string; desde?: string; hasta?: string }> }
) {
  const sp = await searchParams
  const rangoId: RangoId = isRangoId(sp.rango) ? sp.rango : 'mes_actual'
  const r = rangoFechas(rangoId, sp.desde, sp.hasta)

  const supabase = await createClient()
  const admin = createAdminClient()

  // 1) Encontrar negocio Casa
  const { data: casa } = await admin
    .from('negocios')
    .select('id, nombre')
    .eq('tipo', 'casa')
    .single()

  if (!casa) {
    return (
      <div className="px-4 pt-5 pb-24 space-y-4 max-w-3xl mx-auto">
        <EmptyState
          emoji="🏠"
          title="No hay negocio Casa"
          description="Pega el SQL de la migración 0009_casa.sql en Supabase para crearlo automáticamente."
        />
      </div>
    )
  }

  // 2) Socios activos (Miguel + Sergio)
  const { data: socios } = await admin
    .from('profiles')
    .select('id, nombre, role_id, roles(nombre)')
    .eq('activo', true)

  const sociosFiltered = (socios ?? []).filter((p) => {
    const r = p.roles as unknown as { nombre: string } | null
    return r?.nombre === 'admin' || r?.nombre === 'socio'
  })

  // 3) Transacciones de Casa del periodo
  const [
    { data: txs },
    { data: shopping },
    { data: ultimasCasa },
  ] = await Promise.all([
    supabase
      .from('transacciones')
      .select('tipo, monto, moneda, fecha, categoria, capturado_por, monto_mxn_equivalente')
      .eq('negocio_id', casa.id)
      .gte('fecha', r.desde)
      .lte('fecha', r.hasta),
    admin
      .from('casa_shopping')
      .select('id, item, cantidad, prioridad, agregado_por, comprado, comprado_at, comprado_por, notas, created_at')
      .order('comprado', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('transacciones')
      .select('id, tipo, monto, moneda, fecha, concepto, categoria, capturado_por, monto_mxn_equivalente, profiles!transacciones_capturado_por_fkey(nombre)')
      .eq('negocio_id', casa.id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const rows = txs ?? []

  // 4) Calcular balance por socio (gastos en Casa)
  type Balance = { id: string; nombre: string; gastosMxn: number; ingresosMxn: number }
  const balancePorSocio = new Map<string, Balance>()
  for (const s of sociosFiltered) {
    balancePorSocio.set(s.id, { id: s.id, nombre: s.nombre, gastosMxn: 0, ingresosMxn: 0 })
  }
  for (const t of rows) {
    if (!t.capturado_por) continue
    const equiv = t.monto_mxn_equivalente != null ? Number(t.monto_mxn_equivalente) : (t.moneda === 'MXN' ? Number(t.monto) : 0)
    const bal = balancePorSocio.get(t.capturado_por)
    if (!bal) continue
    if (t.tipo === 'gasto' || t.tipo === 'multa_interna') bal.gastosMxn += equiv
    else if (t.tipo === 'ingreso') bal.ingresosMxn += equiv
    else if (t.tipo === 'liquidacion_socio') {
      // Liquidación: el que captura es el que pagó al otro
      // Lo tratamos como un "ingreso al receptor" en términos de saldo, pero
      // como no sabemos quién es el receptor sin extra metadata, lo dejamos como ajuste
      bal.gastosMxn -= equiv // resta lo que ya pagó para compensar
    }
  }

  const balanceArr = Array.from(balancePorSocio.values())
  const totalGastosCasa = balanceArr.reduce((sum, b) => sum + b.gastosMxn, 0)
  const cuotaJusta = balanceArr.length > 0 ? totalGastosCasa / balanceArr.length : 0

  // Quién le debe a quién
  const conSaldo = balanceArr.map((b) => ({
    ...b,
    diferencia: b.gastosMxn - cuotaJusta, // positivo = puso de más, le deben; negativo = puso menos, debe
  }))

  // Asumiendo 2 roomates típico
  const deudores = conSaldo.filter((b) => b.diferencia < -0.01)
  const acreedores = conSaldo.filter((b) => b.diferencia > 0.01)

  // Por categoría
  const topCats = porCategoria(rows.map((t) => ({ ...t, negocio_id: casa.id })))

  // Próximos gastos fijos de Casa
  const en7 = new Date(new Date(hoy_safe() + 'T00:00:00').getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10)
  const { data: proxGfCasa } = await admin
    .from('gastos_recurrentes')
    .select('id, nombre, monto, moneda, proximo_pago')
    .eq('negocio_id', casa.id)
    .eq('activo', true)
    .gte('proximo_pago', hoy_safe())
    .lte('proximo_pago', en7)
    .order('proximo_pago', { ascending: true })

  // Cuentas para liquidar
  const { data: cuentas } = await admin
    .from('cuentas')
    .select('id, nombre, moneda')
    .eq('activo', true)
    .order('nombre')

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
            <Home className="h-6 w-6 text-cyan-400" />
            Casa
          </h1>
          <span className="chip chip-cyan">{rows.length} mov</span>
        </div>
        <p className="text-sm text-zinc-400">Gastos compartidos entre roomates · split 50/50.</p>
        <RangoSelector actual={rangoId} customDesde={sp.desde} customHasta={sp.hasta} />
      </header>

      {/* Hero: total gastado en casa */}
      <section className="card-glow p-5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="label-caps">Total gastado en Casa · {r.label}</span>
          <ArrowDownCircle className="h-4 w-4 text-rose-400/60" />
        </div>
        <p className="text-4xl font-black tabular-nums text-rose-300">
          {formatMoney(totalGastosCasa, 'MXN')}
        </p>
        {balanceArr.length > 0 && (
          <p className="text-xs text-zinc-400">
            Cuota justa por persona: <strong className="text-white">{formatMoney(cuotaJusta, 'MXN')}</strong>
          </p>
        )}
      </section>

      {/* Balance entre roomates */}
      <section className="space-y-2">
        <h2 className="label-caps inline-flex items-center gap-1.5">
          <Scale className="h-3 w-3" /> Balance entre roomates
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {balanceArr.map((b) => {
            const conSaldoB = conSaldo.find((x) => x.id === b.id)!
            const teDeben = conSaldoB.diferencia > 0.01
            const debes = conSaldoB.diferencia < -0.01
            return (
              <div key={b.id} className="card p-3 space-y-1">
                <p className="text-[10px] text-zinc-500 truncate">{b.nombre}</p>
                <p className="text-base font-bold tabular-nums text-white">
                  {formatMoney(b.gastosMxn, 'MXN')}
                </p>
                {teDeben && (
                  <p className="text-[11px] text-emerald-400 tabular-nums">
                    +{formatMoney(conSaldoB.diferencia, 'MXN')} a favor
                  </p>
                )}
                {debes && (
                  <p className="text-[11px] text-rose-400 tabular-nums">
                    debe {formatMoney(Math.abs(conSaldoB.diferencia), 'MXN')}
                  </p>
                )}
                {!teDeben && !debes && balanceArr.length > 0 && (
                  <p className="text-[11px] text-zinc-500">empatado</p>
                )}
              </div>
            )
          })}
        </div>
        {/* Quién le debe a quién */}
        {deudores.length > 0 && acreedores.length > 0 && (
          <div className="card border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
            <p className="text-sm font-bold text-amber-300">⚖ Para empatar:</p>
            {deudores.map((d) => {
              const a = acreedores[0]
              if (!a) return null
              const transferir = Math.min(Math.abs(d.diferencia), a.diferencia)
              return (
                <p key={d.id} className="text-xs text-amber-200">
                  <strong>{d.nombre}</strong> debe pasarle <strong className="tabular-nums">{formatMoney(transferir, 'MXN')}</strong> a <strong>{a.nombre}</strong>
                </p>
              )
            })}
            <LiquidarRoomatesForm
              socios={balanceArr.map((b) => ({ id: b.id, nombre: b.nombre }))}
              cuentas={cuentas ?? []}
              sugeridoMonto={deudores[0] && Math.abs(deudores[0].diferencia)}
              sugeridoPagador={deudores[0]?.id}
              sugeridoReceptor={acreedores[0]?.id}
            />
          </div>
        )}
      </section>

      {/* Próximos gastos fijos de Casa */}
      {proxGfCasa && proxGfCasa.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps">📅 Próximos pagos fijos</h2>
          <ul className="space-y-1.5">
            {proxGfCasa.map((g) => (
              <li key={g.id}>
                <Link href={`/recurrentes/${g.id}`} className="card flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <span className="text-lg">📅</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{g.nombre}</p>
                    <p className="text-[10px] text-zinc-500">{formatearFecha(g.proximo_pago, 'EEEE dd MMM')}</p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-blue-400">
                    {formatMoney(Number(g.monto), g.moneda as 'MXN' | 'USD')}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Top categorías Casa */}
      {topCats.length > 0 && (
        <CategoriasList data={topCats} />
      )}

      {/* Shopping list */}
      <section className="space-y-2">
        <h2 className="label-caps inline-flex items-center gap-1.5">
          <ShoppingCart className="h-3 w-3" /> Lista de compras
        </h2>
        <ShoppingList items={shopping ?? []} />
      </section>

      {/* Últimas tx Casa */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="label-caps">Últimas en Casa</h2>
          <Link href={`/transacciones?negocio=${casa.id}`} className="text-xs text-cyan-400 font-semibold">Ver todas →</Link>
        </div>
        {ultimasCasa && ultimasCasa.length > 0 ? (
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {ultimasCasa.map((u) => {
              const prof = u.profiles as unknown as { nombre: string } | null
              const isGasto = u.tipo === 'gasto' || u.tipo === 'multa_interna'
              return (
                <li key={u.id}>
                  <Link href={`/transacciones/${u.id}`} className="flex items-center gap-3 p-3 hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-sm font-semibold truncate text-zinc-100">{u.concepto || u.categoria || 'Sin concepto'}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {prof?.nombre ?? '—'} · {formatearFecha(u.fecha, 'dd MMM')}
                      </p>
                    </div>
                    <p className={cn('text-sm font-bold tabular-nums', isGasto ? 'text-rose-400' : 'text-emerald-400')}>
                      {isGasto ? '−' : '+'}{formatMoney(Number(u.monto), u.moneda as 'MXN' | 'USD')}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState
            emoji="🏠"
            title="Sin movimientos en Casa"
            description="Cuando captures un gasto con negocio Casa, aparecerá aquí."
            cta={{ label: 'Nueva transacción', href: '/transacciones/nueva' }}
          />
        )}
      </section>
    </div>
  )
}

function hoy_safe() {
  return hoyEnCabos()
}
