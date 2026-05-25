import Link from 'next/link'
import { Calendar, ChevronRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha, hoyEnCabos } from '@/lib/fechas'
import { Fab } from '@/components/ui/fab'

export default async function RecurrentesPage() {
  const supabase = await createClient()
  const hoy = hoyEnCabos()

  const { data: recurrentes } = await supabase
    .from('gastos_recurrentes')
    .select('id, nombre, monto, moneda, frecuencia, proximo_pago, proveedor, negocios(nombre), cuentas(nombre)')
    .eq('activo', true)
    .order('proximo_pago')

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient">Gastos Fijos</h1>
        <p className="text-sm text-zinc-400">
          Rentas, sueldos, servicios y demás gastos recurrentes.
        </p>
      </header>

      {recurrentes && recurrentes.length > 0 ? (
        <ul className="rounded-2xl border bg-white dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden">
          {recurrentes.map((r) => {
            const vencido = r.proximo_pago && r.proximo_pago < hoy
            const hoyEs = r.proximo_pago === hoy
            const neg = r.negocios as unknown as { nombre: string } | null
            const cta = r.cuentas as unknown as { nombre: string } | null

            return (
              <li key={r.id}>
                <Link href={`/recurrentes/${r.id}`} className="flex items-center gap-3 p-4">
                  <div className={cn(
                    'inline-flex h-10 w-10 items-center justify-center rounded-lg',
                    vencido ? 'bg-red-50 dark:bg-red-950 text-red-600'
                    : hoyEs ? 'bg-amber-50 dark:bg-amber-950 text-amber-600'
                    : 'bg-blue-50 dark:bg-blue-950 text-blue-600'
                  )}>
                    {vencido ? <AlertCircle className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0 leading-tight">
                    <p className="font-medium truncate">{r.nombre}</p>
                    <p className="text-xs text-zinc-500 truncate">
                      {r.proximo_pago ? formatearFecha(r.proximo_pago, 'dd MMM') : '—'} ·{' '}
                      <span className="capitalize">{r.frecuencia}</span>
                      {neg && ` · ${neg.nombre}`}
                      {cta && ` · ${cta.nombre}`}
                    </p>
                    {r.proveedor && (
                      <p className="text-[10px] text-zinc-400 truncate">→ {r.proveedor}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatMoney(Number(r.monto), r.moneda as 'MXN' | 'USD')}
                    </p>
                    {vencido && <p className="text-[10px] text-red-600 font-medium">VENCIDO</p>}
                    {hoyEs && <p className="text-[10px] text-amber-600 font-medium">HOY</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-300" />
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-10 text-center space-y-3">
          <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-600" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Sin gastos recurrentes. Toca <strong>+</strong> para agregar el primero.
          </p>
        </div>
      )}

      <Fab href="/recurrentes/nuevo" label="Nuevo recurrente" />
    </div>
  )
}
