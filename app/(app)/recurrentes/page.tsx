import Link from 'next/link'
import { Calendar, ChevronRight, AlertCircle, CheckCircle2, TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha, hoyEnCabos } from '@/lib/fechas'
import { totalMensualEquivalente } from '@/lib/recurrentes-total'
import { Fab } from '@/components/ui/fab'

export default async function RecurrentesPage() {
  const supabase = await createClient()
  const hoy = hoyEnCabos()

  const { data: recurrentes } = await supabase
    .from('gastos_recurrentes')
    .select('id, nombre, monto, moneda, frecuencia, proximo_pago, proveedor, negocios(nombre), cuentas(nombre)')
    .eq('activo', true)
    .order('proximo_pago')

  const total = totalMensualEquivalente(recurrentes ?? [])

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <header className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient">Gastos Fijos</h1>
          <span className="chip">{recurrentes?.length ?? 0} activos</span>
        </div>
        <p className="text-sm text-zinc-400">Rentas, sueldos, servicios y demás gastos recurrentes.</p>
      </header>

      {/* Total mensual equivalente */}
      {recurrentes && recurrentes.length > 0 && (
        <section className="card-glow p-5 space-y-2">
          <div className="flex items-center gap-1.5 text-rose-400">
            <TrendingDown className="h-4 w-4" />
            <span className="label-caps text-rose-400">Total mensual equivalente</span>
          </div>
          <p className="text-3xl font-black tabular-nums text-rose-300">
            {formatMoney(total.mxn, 'MXN')}
          </p>
          {total.usd > 0 && (
            <p className="text-base font-bold tabular-nums text-rose-300/80">
              + {formatMoney(total.usd, 'USD')}
            </p>
          )}
          <p className="text-[10px] text-zinc-500">
            Suma normalizada a 1 mes (semanal × 4.33, quincenal × 2, anual ÷ 12).
          </p>
        </section>
      )}

      {recurrentes && recurrentes.length > 0 ? (
        <ul className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)] overflow-hidden">
          {recurrentes.map((r) => {
            const vencido = r.proximo_pago && r.proximo_pago < hoy
            const hoyEs = r.proximo_pago === hoy
            const neg = r.negocios as unknown as { nombre: string } | null
            const cta = r.cuentas as unknown as { nombre: string } | null

            return (
              <li key={r.id}>
                <Link href={`/recurrentes/${r.id}`} className="flex items-center gap-3 p-4 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <div className={cn(
                    'inline-flex h-10 w-10 items-center justify-center rounded-lg',
                    vencido ? 'bg-rose-500/15 text-rose-400'
                    : hoyEs ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-cyan-500/15 text-cyan-400'
                  )}>
                    {vencido ? <AlertCircle className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0 leading-tight">
                    <p className="font-medium text-white truncate">{r.nombre}</p>
                    <p className="text-xs text-zinc-500 truncate">
                      {r.proximo_pago ? formatearFecha(r.proximo_pago, 'dd MMM') : '—'} ·{' '}
                      <span className="capitalize">{r.frecuencia}</span>
                      {neg && ` · ${neg.nombre}`}
                      {cta && ` · ${cta.nombre}`}
                    </p>
                    {r.proveedor && (
                      <p className="text-[10px] text-zinc-500 truncate">→ {r.proveedor}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums text-white">
                      {formatMoney(Number(r.monto), r.moneda as 'MXN' | 'USD')}
                    </p>
                    {vencido && <p className="text-[10px] text-rose-400 font-medium">VENCIDO</p>}
                    {hoyEs && <p className="text-[10px] text-amber-400 font-medium">HOY</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-500" />
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="card border-dashed p-10 text-center space-y-3">
          <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-400" />
          <p className="text-sm text-zinc-400">
            Sin gastos fijos. Toca <strong>+</strong> para agregar el primero o pídele al chat IA: <em>&ldquo;Agrega la renta de la farmacia $25000 al mes el día 1&rdquo;</em>.
          </p>
        </div>
      )}

      <Fab href="/recurrentes/nuevo" label="Nuevo gasto fijo" />
    </div>
  )
}
