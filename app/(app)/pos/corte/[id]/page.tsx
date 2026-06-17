import Link from 'next/link'
import { ChevronLeft, Plus, CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { cn, formatMoney } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function CorteDetallePage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: corte } = await admin
    .from('cortes_caja')
    .select('*')
    .eq('id', id)
    .single()
  if (!corte) notFound()

  const dif = Number(corte.diferencia_total_mxn ?? 0)
  const cuadra = Math.abs(dif) < 0.5
  const cierre = new Date(corte.cierre_at as string)

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-2xl mx-auto">
      <Link href="/pos" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" />
        Volver al POS
      </Link>

      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-6 w-6 text-emerald-400" />
          <h1 className="text-2xl font-black heading-gradient">Caja cerrada</h1>
        </div>
        <p className="text-[11px] text-zinc-500">
          {corte.cajera_nombre as string ?? 'Cajera'} · {cierre.toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </header>

      {/* Resumen */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 p-4 space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-2xl font-black text-emerald-300 tabular-nums leading-none">{corte.ventas_count as number}</p>
            <p className="text-[10px] text-zinc-500 uppercase mt-1">Ventas</p>
          </div>
          <div>
            <p className="text-2xl font-black text-cyan-300 tabular-nums leading-none">{corte.unidades_vendidas as number}</p>
            <p className="text-[10px] text-zinc-500 uppercase mt-1">Unidades</p>
          </div>
          <div>
            <p className="text-lg font-black text-emerald-300 tabular-nums leading-none">+{formatMoney(Number(corte.ganancia_estimada_mxn ?? 0), 'MXN')}</p>
            <p className="text-[10px] text-zinc-500 uppercase mt-1">Ganancia</p>
          </div>
        </div>
      </div>

      {/* Total y diferencia */}
      <div className={cn(
        'rounded-2xl border p-4 space-y-2',
        cuadra ? 'border-emerald-500/30 bg-emerald-500/5'
          : dif > 0 ? 'border-rose-500/30 bg-rose-500/5'
          : 'border-amber-500/30 bg-amber-500/5'
      )}>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider font-bold text-zinc-500">Total esperado</span>
          <span className="text-xl font-bold text-zinc-300 tabular-nums">{formatMoney(Number(corte.esperado_total_mxn ?? 0), 'MXN')}</span>
        </div>
        <div className="border-t border-zinc-800 pt-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wider font-bold">
            {cuadra ? (
              <><CheckCircle2 className="h-3 w-3 text-emerald-400" /> <span className="text-emerald-300">Cuadra</span></>
            ) : dif > 0 ? (
              <><TrendingDown className="h-3 w-3 text-rose-400" /> <span className="text-rose-300">Falta</span></>
            ) : (
              <><TrendingUp className="h-3 w-3 text-amber-400" /> <span className="text-amber-300">Sobra</span></>
            )}
          </span>
          <span className={cn(
            'text-2xl font-black tabular-nums',
            cuadra ? 'text-emerald-300' : dif > 0 ? 'text-rose-300' : 'text-amber-300'
          )}>
            {dif === 0 ? '$0.00' : (dif > 0 ? '-' : '+') + formatMoney(Math.abs(dif), 'MXN')}
          </span>
        </div>
      </div>

      {/* Desglose por método */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-zinc-800">
        <MetodoSummary label="💵 Efectivo" esperado={Number(corte.esperado_efectivo_mxn ?? 0)} contado={Number(corte.contado_efectivo_mxn ?? 0)} />
        <MetodoSummary label="📱 Mercado Pago" esperado={Number(corte.esperado_mp_mxn ?? 0)} contado={Number(corte.contado_mp_mxn ?? 0)} />
        <MetodoSummary label="💳 Tarjeta" esperado={Number(corte.esperado_tarjeta_mxn ?? 0)} contado={Number(corte.contado_tarjeta_mxn ?? 0)} />
      </div>

      {corte.notas ? (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/40 p-3">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Notas</p>
          <p className="text-sm text-zinc-200">{corte.notas as string}</p>
        </div>
      ) : null}

      {/* CTA nueva caja */}
      <Link
        href="/pos"
        className="block w-full h-12 rounded-xl bg-emerald-600 text-white font-bold inline-flex items-center justify-center gap-1.5 active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" />
        Iniciar nueva venta
      </Link>
    </div>
  )
}

function MetodoSummary({ label, esperado, contado }: { label: string; esperado: number; contado: number }) {
  const dif = esperado - contado
  const cuadra = Math.abs(dif) < 0.5
  return (
    <div className="p-3 flex items-center justify-between">
      <div>
        <p className="text-sm font-bold text-zinc-200">{label}</p>
        <p className="text-[10px] text-zinc-500">
          esperado <span className="tabular-nums">{formatMoney(esperado, 'MXN')}</span> · contado <span className="tabular-nums text-zinc-300">{formatMoney(contado, 'MXN')}</span>
        </p>
      </div>
      <span className={cn(
        'text-sm font-bold tabular-nums',
        cuadra ? 'text-emerald-300' : dif > 0 ? 'text-rose-300' : 'text-amber-300'
      )}>
        {cuadra ? '✓' : (dif > 0 ? '-' : '+') + formatMoney(Math.abs(dif), 'MXN')}
      </span>
    </div>
  )
}
