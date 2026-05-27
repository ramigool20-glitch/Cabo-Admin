import Link from 'next/link'
import { TrendingDown, AlertCircle, Clock, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha, hoyEnCabos } from '@/lib/fechas'
import { EmptyState } from '@/components/ui/empty-state'

const ESTADO_CHIP = {
  pendiente: { l: 'Pendiente', c: 'chip-yellow' },
  parcial:   { l: 'Parcial',   c: 'chip-cyan' },
  pagado:    { l: '✓ Pagado',  c: 'chip-green' },
  vencido:   { l: 'Vencido',   c: 'chip-red' },
  cancelado: { l: 'Cancelado', c: '' },
}

export default async function PorPagarPage() {
  const supabase = await createClient()
  const hoy = hoyEnCabos()

  const { data: cuentas } = await supabase
    .from('cuentas_por_pagar')
    .select('id, proveedor, concepto, monto_total, monto_pagado, moneda, fecha_vencimiento, estado, negocios(nombre)')
    .neq('estado', 'cancelado')
    .order('fecha_vencimiento', { ascending: true })
    .limit(200)

  // Marcar vencidos automáticamente en la vista
  const lista = (cuentas ?? []).map((c) => {
    const restante = Number(c.monto_total) - Number(c.monto_pagado)
    const vencido = c.estado !== 'pagado' && c.fecha_vencimiento && c.fecha_vencimiento < hoy
    return { ...c, restante, vencido }
  })

  // Totales por moneda
  const totales = { adeudado_mxn: 0, adeudado_usd: 0, vencido_mxn: 0, vencido_usd: 0 }
  for (const c of lista) {
    if (c.estado === 'pagado' || c.estado === 'cancelado') continue
    const r = c.restante
    if (c.moneda === 'USD') {
      totales.adeudado_usd += r
      if (c.vencido) totales.vencido_usd += r
    } else {
      totales.adeudado_mxn += r
      if (c.vencido) totales.vencido_mxn += r
    }
  }

  // Aging buckets
  const aging = { d0_30: 0, d30_60: 0, d60_90: 0, d90mas: 0 }
  const ahora = new Date()
  for (const c of lista) {
    if (c.estado === 'pagado' || c.estado === 'cancelado' || !c.fecha_vencimiento || c.moneda !== 'MXN') continue
    const venc = new Date(c.fecha_vencimiento)
    const diff = Math.floor((ahora.getTime() - venc.getTime()) / (1000 * 60 * 60 * 24))
    if (diff < 30) aging.d0_30 += c.restante
    else if (diff < 60) aging.d30_60 += c.restante
    else if (diff < 90) aging.d60_90 += c.restante
    else aging.d90mas += c.restante
  }

  const vencidas = lista.filter((c) => c.vencido || c.estado === 'vencido')
  // Pendientes: todo lo que no esté vencido ni pagado (incluso sin fecha)
  const proximas = lista.filter((c) => !c.vencido && c.estado !== 'pagado' && c.fecha_vencimiento)
  const sinFecha = lista.filter((c) => !c.vencido && c.estado !== 'pagado' && !c.fecha_vencimiento)
  const pagadas = lista.filter((c) => c.estado === 'pagado')

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient">Por Pagar</h1>
          <span className="chip">{lista.length} cuentas</span>
        </div>
        <p className="text-sm text-zinc-400">Deudas con proveedores. La IA detecta vencidos y te avisa.</p>
      </header>

      {/* Total adeudado */}
      <section className="card-glow p-5 space-y-2">
        <div className="flex items-center gap-2 text-rose-400">
          <TrendingDown className="h-4 w-4" />
          <span className="label-caps text-rose-400">Total adeudado</span>
        </div>
        <p className="text-3xl font-black tabular-nums text-rose-300">
          {formatMoney(totales.adeudado_mxn, 'MXN')}
        </p>
        {totales.adeudado_usd > 0 && (
          <p className="text-base font-bold tabular-nums text-rose-300/80">
            + {formatMoney(totales.adeudado_usd, 'USD')}
          </p>
        )}
        {(totales.vencido_mxn > 0 || totales.vencido_usd > 0) && (
          <p className="text-xs text-amber-400">
            ⚠ {formatMoney(totales.vencido_mxn, 'MXN')} vencido{totales.vencido_usd > 0 ? ` + ${formatMoney(totales.vencido_usd, 'USD')}` : ''}
          </p>
        )}
      </section>

      {/* Aging report MXN */}
      {(aging.d0_30 + aging.d30_60 + aging.d60_90 + aging.d90mas) > 0 && (
        <section className="card p-4 space-y-3">
          <p className="label-caps">Antigüedad de deuda (MXN)</p>
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

      {/* Vencidas */}
      {vencidas.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps text-rose-400">
            <AlertCircle className="h-3 w-3 inline mr-1" /> Vencidas ({vencidas.length})
          </h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {vencidas.map((c) => <CuentaRow key={c.id} c={c} />)}
          </ul>
        </section>
      )}

      {/* Próximas */}
      {proximas.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps">
            <Clock className="h-3 w-3 inline mr-1" /> Pendientes ({proximas.length})
          </h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {proximas.map((c) => <CuentaRow key={c.id} c={c} />)}
          </ul>
        </section>
      )}

      {/* Sin fecha de vencimiento */}
      {sinFecha.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps">
            <Clock className="h-3 w-3 inline mr-1" /> Sin fecha definida ({sinFecha.length})
          </h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {sinFecha.map((c) => <CuentaRow key={c.id} c={c} />)}
          </ul>
        </section>
      )}

      {/* Pagadas recientes */}
      {pagadas.length > 0 && (
        <section className="space-y-2 opacity-60">
          <h2 className="label-caps">Pagadas recientes</h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {pagadas.slice(0, 5).map((c) => <CuentaRow key={c.id} c={c} />)}
          </ul>
        </section>
      )}

      {lista.length === 0 && (
        <EmptyState
          emoji="💸"
          title="Sin cuentas por pagar"
          description="Aquí van las deudas con proveedores. Captura una factura desde el chat IA o crea manual."
          hint={<>Ej: <em>&ldquo;Le debo $5,000 a Suministros Cabo por mercancía, vence el 30&rdquo;</em></>}
          cta={{ label: 'Nueva cuenta', href: '/por-pagar/nueva' }}
        />
      )}
    </div>
  )
}

type Cuenta = {
  id: string
  proveedor: string
  concepto: string
  monto_total: number
  monto_pagado: number
  moneda: 'MXN' | 'USD'
  fecha_vencimiento: string | null
  estado: keyof typeof ESTADO_CHIP
  restante: number
  vencido: boolean
  negocios: unknown
}

function CuentaRow({ c }: { c: Cuenta }) {
  const neg = c.negocios as { nombre: string } | null
  const estado = c.vencido ? ESTADO_CHIP.vencido : ESTADO_CHIP[c.estado]
  return (
    <li>
      <Link href={`/por-pagar/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)] transition-colors">
        <div className="flex-1 min-w-0 leading-tight">
          <p className="text-sm font-semibold text-white truncate">{c.proveedor}</p>
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
          <p className="text-sm font-bold tabular-nums text-rose-300">
            {formatMoney(Number(c.restante), c.moneda as 'MXN' | 'USD')}
          </p>
          {Number(c.monto_pagado) > 0 && (
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
