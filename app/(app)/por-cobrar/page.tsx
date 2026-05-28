import Link from 'next/link'
import { TrendingUp, AlertCircle, Clock, ChevronRight, PartyPopper, Plus, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha, hoyEnCabos } from '@/lib/fechas'
import { EmptyState } from '@/components/ui/empty-state'

const ESTADO_CHIP = {
  pendiente: { l: 'Pendiente', c: 'chip-yellow' },
  parcial:   { l: 'Parcial',   c: 'chip-cyan' },
  cobrado:   { l: '✓ Cobrado', c: 'chip-green' },
  vencido:   { l: 'Vencido',   c: 'chip-red' },
  cancelado: { l: 'Cancelado', c: '' },
}

export default async function PorCobrarPage() {
  const supabase = await createClient()
  const hoy = hoyEnCabos()

  const [{ data: cuentas }, { data: eventosActivos }, { data: fxLatest }] = await Promise.all([
    // Fetch FX rate for conversions
    supabase
      .from('cuentas_por_cobrar')
      .select('id, cliente_nombre, concepto, monto_total, monto_cobrado, moneda, fecha_vencimiento, estado, negocios(nombre)')
      .neq('estado', 'cancelado')
      .order('fecha_vencimiento', { ascending: true })
      .limit(200),
    // Eventos con potencial pago pendiente
    supabase
      .from('eventos')
      .select('id, cliente_nombre, fecha_evento, monto_total, moneda, estado, paquete, num_personas, eventos_pagos(monto)')
      .in('estado', ['reservado', 'confirmado'])
      .order('fecha_evento', { ascending: true })
      .limit(100),
    supabase.from('fx_rates').select('rate_compra').order('fecha', { ascending: false }).limit(1).maybeSingle(),
  ])

  const fxRate = fxLatest ? Number(fxLatest.rate_compra) : 17

  // Procesar eventos pendientes
  type EventoPendiente = {
    id: string
    cliente_nombre: string
    fecha_evento: string
    monto_total: number
    monto_cobrado: number
    moneda: 'MXN' | 'USD'
    pendiente: number
    paquete: string | null
    num_personas: number | null
    estado: string
    vencido: boolean
  }
  const eventosPendientes: EventoPendiente[] = (eventosActivos ?? []).map((e) => {
    const pagos = (e.eventos_pagos as Array<{ monto: number }>) ?? []
    const cobrado = pagos.reduce((sum, p) => sum + Number(p.monto), 0)
    const pendiente = Number(e.monto_total) - cobrado
    return {
      id: e.id,
      cliente_nombre: e.cliente_nombre,
      fecha_evento: e.fecha_evento,
      monto_total: Number(e.monto_total),
      monto_cobrado: cobrado,
      moneda: e.moneda as 'MXN' | 'USD',
      pendiente,
      paquete: e.paquete,
      num_personas: e.num_personas,
      estado: e.estado,
      vencido: e.fecha_evento < hoy, // si el evento ya pasó y aún no cobraste todo
    }
  }).filter((e) => e.pendiente > 0.01)

  const lista = (cuentas ?? []).map((c) => {
    const restante = Number(c.monto_total) - Number(c.monto_cobrado)
    const vencido = c.estado !== 'cobrado' && c.fecha_vencimiento && c.fecha_vencimiento < hoy
    return { ...c, restante, vencido }
  })

  const totales = { por_cobrar_mxn: 0, por_cobrar_usd: 0, vencido_mxn: 0, vencido_usd: 0 }
  for (const c of lista) {
    if (c.estado === 'cobrado' || c.estado === 'cancelado') continue
    const r = c.restante
    if (c.moneda === 'USD') {
      totales.por_cobrar_usd += r
      if (c.vencido) totales.vencido_usd += r
    } else {
      totales.por_cobrar_mxn += r
      if (c.vencido) totales.vencido_mxn += r
    }
  }
  // Suma eventos pendientes a los totales
  let eventosTotalMxn = 0
  let eventosTotalUsd = 0
  let eventosVencidoMxn = 0
  for (const e of eventosPendientes) {
    if (e.moneda === 'USD') {
      eventosTotalUsd += e.pendiente
      totales.por_cobrar_usd += e.pendiente
      if (e.vencido) totales.vencido_usd += e.pendiente
    } else {
      eventosTotalMxn += e.pendiente
      totales.por_cobrar_mxn += e.pendiente
      if (e.vencido) {
        totales.vencido_mxn += e.pendiente
        eventosVencidoMxn += e.pendiente
      }
    }
  }

  // Aging — fix: incluye USD convertido + TZ correcto
  const aging = { d0_30: 0, d30_60: 0, d60_90: 0, d90mas: 0 }
  const ahora = new Date(hoy + 'T00:00:00')
  for (const c of lista) {
    if (c.estado === 'cobrado' || c.estado === 'cancelado' || !c.fecha_vencimiento) continue
    const venc = new Date(c.fecha_vencimiento + 'T00:00:00')
    const diff = Math.floor((ahora.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24))
    const equivMxn = c.moneda === 'USD' ? c.restante * fxRate : c.restante
    if (diff < 30) aging.d0_30 += equivMxn
    else if (diff < 60) aging.d30_60 += equivMxn
    else if (diff < 90) aging.d60_90 += equivMxn
    else aging.d90mas += equivMxn
  }

  const vencidas = lista.filter((c) => c.vencido || c.estado === 'vencido')
  const proximas = lista.filter((c) => !c.vencido && c.estado !== 'cobrado' && c.fecha_vencimiento)
  const cobradas = lista.filter((c) => c.estado === 'cobrado')

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient">Por Cobrar</h1>
          <span className="chip">{lista.length + eventosPendientes.length} pendientes</span>
        </div>
        <p className="text-sm text-zinc-400">Dinero que te deben clientes y eventos del Rancho.</p>
        <Link
          href="/por-cobrar/nueva"
          className="btn-primary h-10 text-sm w-full"
        >
          <Plus className="h-4 w-4" />
          Agregar deuda de cliente
        </Link>
      </header>

      <section className="card-glow p-5 space-y-2">
        <div className="flex items-center gap-2 text-emerald-400">
          <TrendingUp className="h-4 w-4" />
          <span className="label-caps text-emerald-400">Total por cobrar</span>
        </div>
        <p className="text-3xl font-black tabular-nums text-emerald-300">
          {formatMoney(totales.por_cobrar_mxn + totales.por_cobrar_usd * fxRate, 'MXN')}
        </p>
        <p className="text-[10px] text-zinc-500">equivalente total con rate ${fxRate.toFixed(2)}</p>
        {totales.por_cobrar_usd > 0 && (
          <div className="flex items-baseline gap-2 text-xs text-zinc-400 tabular-nums">
            <span>{formatMoney(totales.por_cobrar_mxn, 'MXN')}</span>
            <span>+ {formatMoney(totales.por_cobrar_usd, 'USD')}</span>
            <span className="text-zinc-600">(≈ {formatMoney(totales.por_cobrar_usd * fxRate, 'MXN')})</span>
          </div>
        )}
        {(totales.vencido_mxn > 0 || totales.vencido_usd > 0) && (
          <p className="text-xs text-amber-400">
            ⚠ Vencido: {formatMoney(totales.vencido_mxn + totales.vencido_usd * fxRate, 'MXN')} equivalente
          </p>
        )}
      </section>

      {(aging.d0_30 + aging.d30_60 + aging.d60_90 + aging.d90mas) > 0 && (
        <section className="card p-4 space-y-3">
          <p className="label-caps">Antigüedad por cobrar (MXN)</p>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <p className="text-[10px] text-zinc-500">0-30 días</p>
              <p className="text-sm font-bold text-emerald-400 tabular-nums">{formatMoney(aging.d0_30, 'MXN')}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500">30-60</p>
              <p className="text-sm font-bold text-amber-400 tabular-nums">{formatMoney(aging.d30_60, 'MXN')}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500">60-90</p>
              <p className="text-sm font-bold text-orange-400 tabular-nums">{formatMoney(aging.d60_90, 'MXN')}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500">+90</p>
              <p className="text-sm font-bold text-rose-400 tabular-nums">{formatMoney(aging.d90mas, 'MXN')}</p>
            </div>
          </div>
        </section>
      )}

      {/* 1️⃣ PENDIENTES de clientes (deudas manuales) — VAN ARRIBA */}
      {vencidas.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps text-rose-400">
            <AlertCircle className="h-3 w-3 inline mr-1" /> Cuentas vencidas ({vencidas.length})
          </h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {vencidas.map((c) => <CuentaRow key={c.id} c={c} fxRate={fxRate} />)}
          </ul>
        </section>
      )}

      {proximas.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps">
            <Clock className="h-3 w-3 inline mr-1" /> Pendientes ({proximas.length})
          </h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {proximas.map((c) => <CuentaRow key={c.id} c={c} fxRate={fxRate} />)}
          </ul>
        </section>
      )}

      {/* 2️⃣ EVENTOS RANCHO — VAN ABAJO. Click → editable al 100% */}
      {eventosPendientes.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps inline-flex items-center gap-1">
            <PartyPopper className="h-3 w-3 text-purple-400" />
            Eventos del Rancho pendientes ({eventosPendientes.length})
            {eventosTotalMxn > 0 && (
              <span className="ml-1 text-purple-300 tabular-nums">
                · {formatMoney(eventosTotalMxn, 'MXN')}
              </span>
            )}
          </h2>
          <p className="text-[10px] text-zinc-500 px-1">
            Toca el evento → editas TODO (anticipo, monto, personas, fecha, paquete)
          </p>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {eventosPendientes.map((e) => {
              const pct = e.monto_total > 0 ? (e.monto_cobrado / e.monto_total) * 100 : 0
              const diasFalta = Math.ceil(
                (new Date(e.fecha_evento + 'T00:00:00').getTime() - new Date(hoy + 'T00:00:00').getTime())
                / (24 * 60 * 60 * 1000)
              )
              const fechaLabel = diasFalta < 0
                ? `vencido hace ${Math.abs(diasFalta)}d`
                : diasFalta === 0 ? 'HOY'
                : diasFalta === 1 ? 'mañana'
                : `en ${diasFalta} días`
              return (
                <li key={e.id}>
                  <Link href={`/eventos/${e.id}`} className="block p-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                    <div className="flex items-start gap-3">
                      <span className="text-lg">🎉</span>
                      <div className="flex-1 min-w-0 leading-tight">
                        <p className="text-sm font-bold text-white truncate">{e.cliente_nombre}</p>
                        <p className="text-[10px] text-zinc-500 truncate">
                          {e.paquete || 'Evento'}
                          {e.num_personas != null && ` · 👥 ${e.num_personas}`}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={cn(
                            'chip text-[9px] h-4 px-1.5',
                            e.vencido ? 'chip-red' : diasFalta <= 7 ? 'chip-yellow' : 'chip-cyan'
                          )}>
                            {formatearFecha(e.fecha_evento, 'dd MMM')} · {fechaLabel}
                          </span>
                          {e.monto_cobrado > 0 && (
                            <span className="text-[10px] text-emerald-400">
                              anticipo {formatMoney(e.monto_cobrado, e.moneda)} ({Math.round(pct)}%)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums text-emerald-300">
                          {formatMoney(e.pendiente, e.moneda)}
                        </p>
                        <p className="text-[10px] text-zinc-500 tabular-nums">
                          de {formatMoney(e.monto_total, e.moneda)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0 mt-1" />
                    </div>
                    {/* Progress bar */}
                    {e.monto_total > 0 && (
                      <div className="mt-2 ml-7 h-1 rounded-full bg-[var(--bg-input)] overflow-hidden">
                        <div
                          className={cn(
                            'h-full transition-all',
                            e.pendiente <= 0.01 ? 'bg-emerald-500'
                            : e.monto_cobrado > 0 ? 'bg-gradient-to-r from-amber-500 to-emerald-500'
                            : 'bg-rose-500/50'
                          )}
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
          {eventosVencidoMxn > 0 && (
            <p className="text-[11px] text-rose-400 px-1">
              ⚠ {formatMoney(eventosVencidoMxn, 'MXN')} en eventos que ya pasaron sin cobrar el total
            </p>
          )}
        </section>
      )}

      {cobradas.length > 0 && (
        <section className="space-y-2 opacity-60">
          <h2 className="label-caps">Cobradas recientes</h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {cobradas.slice(0, 5).map((c) => <CuentaRow key={c.id} c={c} fxRate={fxRate} />)}
          </ul>
        </section>
      )}

      {lista.length === 0 && eventosPendientes.length === 0 && (
        <EmptyState
          emoji="💰"
          title="Sin nada por cobrar"
          description="Aquí van los dineros que te deben tus clientes y eventos del Rancho con pendiente."
          hint={<>Ej: <em>&ldquo;María me debe $3,000 del evento, paga el 15&rdquo;</em></>}
          cta={{ label: 'Nueva cuenta', href: '/por-cobrar/nueva' }}
        />
      )}
    </div>
  )
}

type Cuenta = {
  id: string
  cliente_nombre: string
  concepto: string
  monto_total: number
  monto_cobrado: number
  moneda: 'MXN' | 'USD'
  fecha_vencimiento: string | null
  estado: keyof typeof ESTADO_CHIP
  restante: number
  vencido: boolean
  negocios: unknown
}

function CuentaRow({ c, fxRate }: { c: Cuenta; fxRate: number }) {
  const neg = c.negocios as { nombre: string } | null
  const estado = c.vencido ? ESTADO_CHIP.vencido : ESTADO_CHIP[c.estado]
  const esUsd = c.moneda === 'USD'
  const equivMxn = esUsd ? c.restante * fxRate : 0
  return (
    <li>
      <Link href={`/por-cobrar/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)] transition-colors">
        <div className="flex-1 min-w-0 leading-tight">
          <p className="text-sm font-semibold text-white truncate">{c.cliente_nombre}</p>
          <p className="text-xs text-zinc-500 truncate">{c.concepto}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={cn('chip text-[9px] h-5 px-2', estado.c)}>{estado.l}</span>
            {c.fecha_vencimiento && (
              <span className="text-[10px] text-zinc-500">
                {formatearFecha(c.fecha_vencimiento, 'dd MMM')}
              </span>
            )}
            {neg?.nombre && <span className="text-[10px] text-cyan-400">🏢 {neg.nombre}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold tabular-nums text-emerald-300">
            {formatMoney(Number(c.restante), c.moneda as 'MXN' | 'USD')}
            {esUsd && <span className="text-[10px] text-emerald-300/60 font-normal ml-1">USD</span>}
          </p>
          {esUsd && (
            <p className="text-[10px] text-zinc-500 tabular-nums">≈ {formatMoney(equivMxn, 'MXN')}</p>
          )}
          {Number(c.monto_cobrado) > 0 && (
            <p className="text-[10px] text-zinc-500">
              de {formatMoney(Number(c.monto_total), c.moneda as 'MXN' | 'USD')}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-zinc-500" />
      </Link>
    </li>
  )
}
