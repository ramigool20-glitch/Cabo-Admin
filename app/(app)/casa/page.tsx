import Link from 'next/link'
import { Home, ArrowDownCircle, ShoppingCart, Scale, ChevronRight, Users, User } from 'lucide-react'
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

type SearchParams = {
  rango?: string
  desde?: string
  hasta?: string
  /** 'compartido' | 'personal' | socio_id */
  vista?: string
}

export default async function CasaPage(
  { searchParams }: { searchParams: Promise<SearchParams> }
) {
  const sp = await searchParams
  const rangoId: RangoId = isRangoId(sp.rango) ? sp.rango : 'mes_actual'
  const r = rangoFechas(rangoId, sp.desde, sp.hasta)
  const vista = sp.vista ?? 'todo'

  const supabase = await createClient()
  const admin = createAdminClient()

  // 1) Negocio Casa
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

  // 2) Socios activos
  const { data: socios } = await admin
    .from('profiles')
    .select('id, nombre, role_id, roles(nombre)')
    .eq('activo', true)

  const sociosFiltered = (socios ?? []).filter((p) => {
    const r = p.roles as unknown as { nombre: string } | null
    return r?.nombre === 'admin' || r?.nombre === 'socio'
  })

  // 3) Transacciones de Casa del periodo (defensive: atribuido_a puede no existir)
  type CasaTx = {
    id: string
    tipo: string
    monto: number
    moneda: string
    fecha: string
    categoria: string | null
    capturado_por: string | null
    monto_mxn_equivalente: number | null
    concepto: string | null
    atribuido_a?: string | null
  }
  const txsColsBase = 'id, tipo, monto, moneda, fecha, categoria, capturado_por, monto_mxn_equivalente, concepto'
  const ultColsBase = 'id, tipo, monto, moneda, fecha, concepto, categoria, capturado_por, monto_mxn_equivalente'

  let txs: CasaTx[] = []
  {
    const r1 = await supabase
      .from('transacciones')
      .select(`${txsColsBase}, atribuido_a`)
      .eq('negocio_id', casa.id)
      .gte('fecha', r.desde)
      .lte('fecha', r.hasta)
    if (r1.error && /atribuido_a/.test(r1.error.message ?? '')) {
      const r2 = await supabase
        .from('transacciones')
        .select(txsColsBase)
        .eq('negocio_id', casa.id)
        .gte('fecha', r.desde)
        .lte('fecha', r.hasta)
      txs = (r2.data ?? []) as unknown as CasaTx[]
    } else {
      txs = (r1.data ?? []) as unknown as CasaTx[]
    }
  }

  let ultimasCasa: CasaTx[] = []
  {
    const r1 = await supabase
      .from('transacciones')
      .select(`${ultColsBase}, atribuido_a`)
      .eq('negocio_id', casa.id)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(15)
    if (r1.error && /atribuido_a/.test(r1.error.message ?? '')) {
      const r2 = await supabase
        .from('transacciones')
        .select(ultColsBase)
        .eq('negocio_id', casa.id)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(15)
      ultimasCasa = (r2.data ?? []) as unknown as CasaTx[]
    } else {
      ultimasCasa = (r1.data ?? []) as unknown as CasaTx[]
    }
  }

  // Resto de queries
  const [{ data: shopping }, { data: proxGfCasa }, { data: cuentas }] = await Promise.all([
    admin
      .from('casa_shopping')
      .select('id, item, cantidad, prioridad, agregado_por, comprado, comprado_at, comprado_por, notas, created_at')
      .order('comprado', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(50),
    admin
      .from('gastos_recurrentes')
      .select('id, nombre, monto, moneda, proximo_pago')
      .eq('negocio_id', casa.id)
      .eq('activo', true)
      .gte('proximo_pago', hoyEnCabos())
      .lte('proximo_pago', new Date(new Date(hoyEnCabos() + 'T00:00:00').getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .order('proximo_pago', { ascending: true }),
    admin
      .from('cuentas')
      .select('id, nombre, moneda')
      .eq('activo', true)
      .order('nombre'),
  ])

  const rows = txs ?? []
  const N = Math.max(1, sociosFiltered.length)

  // === LÓGICA DE BUCKETS ===
  // compartido = sin atribuido_a → split entre todos
  // personal de X = atribuido_a == X → 100% le toca a X
  let compartidoMxn = 0
  const personalPorSocio = new Map<string, number>()
  const totalPagadoPorSocio = new Map<string, number>() // capturado_por

  for (const s of sociosFiltered) {
    personalPorSocio.set(s.id, 0)
    totalPagadoPorSocio.set(s.id, 0)
  }

  for (const t of rows) {
    const equiv = t.monto_mxn_equivalente != null
      ? Number(t.monto_mxn_equivalente)
      : (t.moneda === 'MXN' ? Number(t.monto) : 0)

    if (t.tipo === 'gasto' || t.tipo === 'multa_interna') {
      if (t.atribuido_a) {
        personalPorSocio.set(t.atribuido_a, (personalPorSocio.get(t.atribuido_a) ?? 0) + equiv)
      } else {
        compartidoMxn += equiv
      }
      // Track quien lo pagó físicamente
      if (t.capturado_por) {
        totalPagadoPorSocio.set(t.capturado_por, (totalPagadoPorSocio.get(t.capturado_por) ?? 0) + equiv)
      }
    } else if (t.tipo === 'liquidacion_socio' && t.capturado_por) {
      // Liquidación entre socios: el que captura pagó al otro
      totalPagadoPorSocio.set(t.capturado_por, (totalPagadoPorSocio.get(t.capturado_por) ?? 0) - equiv)
    }
  }

  const cuotaCompartida = compartidoMxn / N
  const totalGastosCasa = compartidoMxn + Array.from(personalPorSocio.values()).reduce((a, b) => a + b, 0)

  // Por socio: cuánto "le toca" pagar = cuotaCompartida + sus personales
  type SocioReport = {
    id: string
    nombre: string
    personal: number       // sus gastos personales (la cuenta los cubrió)
    cuotaCompartida: number // su parte del compartido
    leToca: number         // total que es "suyo" = personal + cuota compartida
    pagoFisico: number     // total que él/ella registró físicamente
    diferencia: number     // pagoFisico - leToca (positivo = puso de más, le deben)
  }
  const reportes: SocioReport[] = sociosFiltered.map((s) => {
    const personal = personalPorSocio.get(s.id) ?? 0
    const pagoFisico = totalPagadoPorSocio.get(s.id) ?? 0
    const leToca = cuotaCompartida + personal
    return {
      id: s.id,
      nombre: s.nombre,
      personal,
      cuotaCompartida,
      leToca,
      pagoFisico,
      diferencia: pagoFisico - leToca,
    }
  })

  // Quién le debe a quién para empatar
  const deudores = reportes.filter((b) => b.diferencia < -0.01)
  const acreedores = reportes.filter((b) => b.diferencia > 0.01)

  // Filtrar transacciones para la lista visible según vista
  const rowsFiltered = ultimasCasa?.filter((t) => {
    if (vista === 'todo') return true
    if (vista === 'compartido') return !t.atribuido_a
    return t.atribuido_a === vista
  }) ?? []

  // Top categorías Casa según vista
  const topCats = porCategoria(
    rows
      .filter((t) => {
        if (vista === 'todo') return true
        if (vista === 'compartido') return !t.atribuido_a
        return t.atribuido_a === vista
      })
      .map((t) => ({ ...t, negocio_id: casa.id }))
  )

  // Total reembolso personal pendiente (suma de los gastos personales = lo que la cuenta común cubrió y debería volver)
  const totalReembolsoPersonal = Array.from(personalPorSocio.values()).reduce((a, b) => a + b, 0)

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
            <Home className="h-6 w-6 text-cyan-400" />
            Casa
          </h1>
          <span className="chip chip-cyan">{rows.length} mov</span>
        </div>
        <p className="text-sm text-zinc-400">Gastos compartidos + personales. La cuenta cubre todo, aquí ves quién gasta qué.</p>
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
        <div className="grid grid-cols-3 gap-2 pt-2 text-[10px]">
          <div>
            <p className="text-zinc-500">⚖ Compartido</p>
            <p className="text-sm font-bold text-cyan-300 tabular-nums">{formatMoney(compartidoMxn, 'MXN')}</p>
          </div>
          <div>
            <p className="text-zinc-500">👤 Personales</p>
            <p className="text-sm font-bold text-purple-300 tabular-nums">{formatMoney(totalReembolsoPersonal, 'MXN')}</p>
          </div>
          <div>
            <p className="text-zinc-500">Cuota /persona</p>
            <p className="text-sm font-bold text-white tabular-nums">{formatMoney(cuotaCompartida, 'MXN')}</p>
          </div>
        </div>
      </section>

      {/* Tabs de vista */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { key: 'todo', label: 'Todos' },
          { key: 'compartido', label: '⚖ Compartido' },
          ...sociosFiltered.map((s) => ({ key: s.id, label: `👤 ${s.nombre}` })),
        ].map((opt) => {
          const active = vista === opt.key
          const qs = new URLSearchParams({ rango: rangoId })
          if (sp.desde) qs.set('desde', sp.desde)
          if (sp.hasta) qs.set('hasta', sp.hasta)
          if (opt.key !== 'todo') qs.set('vista', opt.key)
          return (
            <Link
              key={opt.key}
              href={`/casa?${qs.toString()}`}
              className={cn(
                'h-7 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors',
                active ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300' : 'border-[var(--border-subtle)] text-zinc-500 hover:text-white'
              )}
            >
              {opt.label}
            </Link>
          )
        })}
      </div>

      {/* Balance por socio: cuánto le toca pagar */}
      <section className="space-y-2">
        <h2 className="label-caps inline-flex items-center gap-1.5">
          <Scale className="h-3 w-3" /> Cuánto le toca a cada uno
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {reportes.map((b) => {
            const teDeben = b.diferencia > 0.01
            const debes = b.diferencia < -0.01
            return (
              <div key={b.id} className={cn(
                'card p-3 space-y-1.5 border',
                teDeben ? 'border-emerald-500/30' : debes ? 'border-rose-500/30' : 'border-[var(--border-subtle)]'
              )}>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-cyan-400" />
                  <p className="text-sm font-bold text-white">{b.nombre}</p>
                </div>
                <p className="text-xl font-black tabular-nums text-white">
                  {formatMoney(b.leToca, 'MXN')}
                </p>
                <div className="space-y-0.5 text-[10px] text-zinc-500">
                  <div className="flex items-center justify-between">
                    <span>Su personal:</span>
                    <span className="text-purple-300 tabular-nums">{formatMoney(b.personal, 'MXN')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>+ ½ compartido:</span>
                    <span className="text-cyan-300 tabular-nums">{formatMoney(b.cuotaCompartida, 'MXN')}</span>
                  </div>
                  <div className="flex items-center justify-between pt-0.5 border-t border-[var(--border-subtle)]">
                    <span>Pagó físicamente:</span>
                    <span className="text-white tabular-nums">{formatMoney(b.pagoFisico, 'MXN')}</span>
                  </div>
                </div>
                {teDeben && (
                  <p className="text-[11px] text-emerald-400 tabular-nums font-bold">
                    +{formatMoney(b.diferencia, 'MXN')} le deben
                  </p>
                )}
                {debes && (
                  <p className="text-[11px] text-rose-400 tabular-nums font-bold">
                    debe {formatMoney(Math.abs(b.diferencia), 'MXN')}
                  </p>
                )}
                {!teDeben && !debes && (
                  <p className="text-[11px] text-zinc-500">empatado</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Liquidar */}
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
              socios={reportes.map((b) => ({ id: b.id, nombre: b.nombre }))}
              cuentas={cuentas ?? []}
              sugeridoMonto={deudores[0] && Math.abs(deudores[0].diferencia)}
              sugeridoPagador={deudores[0]?.id}
              sugeridoReceptor={acreedores[0]?.id}
            />
          </div>
        )}
      </section>

      {/* Reembolsos personales pendientes */}
      {totalReembolsoPersonal > 0 && (
        <section className="card-glow border-purple-500/30 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-300" />
            <p className="label-caps text-purple-300">Gastos personales (cubiertos por la cuenta común)</p>
          </div>
          <p className="text-[11px] text-zinc-400">
            Estos son gastos personales que salieron de la cuenta del trabajo y deberían reembolsarse a la sociedad.
          </p>
          <ul className="space-y-1 pt-1">
            {reportes.map((b) => b.personal > 0 ? (
              <li key={b.id} className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">👤 {b.nombre}</span>
                <span className="text-purple-300 font-bold tabular-nums">{formatMoney(b.personal, 'MXN')}</span>
              </li>
            ) : null)}
            <li className="flex items-center justify-between text-xs pt-1.5 border-t border-purple-500/20 font-bold">
              <span className="text-white">Total a reembolsar</span>
              <span className="text-purple-300 tabular-nums">{formatMoney(totalReembolsoPersonal, 'MXN')}</span>
            </li>
          </ul>
        </section>
      )}

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

      {/* Top categorías Casa (según vista) */}
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

      {/* Últimas tx Casa (filtradas por vista) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="label-caps">
            {vista === 'todo' ? 'Últimas en Casa' :
             vista === 'compartido' ? 'Últimas compartidas' :
             `Últimas de ${sociosFiltered.find((s) => s.id === vista)?.nombre ?? '—'}`}
          </h2>
          <Link href={`/transacciones?negocio=${casa.id}`} className="text-xs text-cyan-400 font-semibold">Ver todas →</Link>
        </div>
        {rowsFiltered.length > 0 ? (
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {rowsFiltered.map((u) => {
              const isGasto = u.tipo === 'gasto' || u.tipo === 'multa_interna'
              const atribuidoSocio = u.atribuido_a ? sociosFiltered.find((s) => s.id === u.atribuido_a) : null
              return (
                <li key={u.id}>
                  <Link href={`/transacciones/${u.id}`} className="flex items-center gap-3 p-3 hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-sm font-semibold truncate text-zinc-100">{u.concepto || u.categoria || 'Sin concepto'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-zinc-500">{formatearFecha(u.fecha, 'dd MMM')}</span>
                        {atribuidoSocio ? (
                          <span className="chip text-[9px] h-4 px-1.5 chip-purple">👤 {atribuidoSocio.nombre}</span>
                        ) : (
                          <span className="chip text-[9px] h-4 px-1.5 chip-cyan">⚖ Compartido</span>
                        )}
                      </div>
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
            title={vista === 'todo' ? 'Sin movimientos en Casa' : 'Sin movimientos en esta vista'}
            description="Cuando captures un gasto con negocio Casa, aparecerá aquí."
            cta={{ label: 'Nueva transacción', href: '/transacciones/nueva' }}
          />
        )}
      </section>
    </div>
  )
}
