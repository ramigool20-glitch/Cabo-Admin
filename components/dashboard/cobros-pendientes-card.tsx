/**
 * Card en dashboard que muestra cobros MP entrados automáticamente que aún
 * NO tienen negocio o categoría asignados. Tap → pantalla 1-tap para
 * categorizar rápido.
 */
import Link from 'next/link'
import { ChevronRight, HelpCircle } from 'lucide-react'
import { formatMoney, cn } from '@/lib/utils'

type Pendiente = {
  id: string
  monto: number
  moneda: 'MXN' | 'USD'
  concepto: string | null
  fecha: string
  cuenta_nombre: string | null
}

export function CobrosPendientesCard({ pendientes }: { pendientes: Pendiente[] }) {
  if (pendientes.length === 0) return null

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        <HelpCircle className="h-5 w-5 text-amber-400" />
        <h3 className="text-sm font-bold text-amber-200">
          {pendientes.length} cobro{pendientes.length === 1 ? '' : 's'} sin categorizar
        </h3>
      </div>
      <p className="px-4 pb-3 text-xs text-amber-200/70">
        Entraron automáticos de Mercado Pago. Toca uno para asignarle negocio.
      </p>
      <ul className="divide-y divide-amber-500/20 border-t border-amber-500/20">
        {pendientes.slice(0, 3).map((p) => (
          <li key={p.id}>
            <Link
              href={`/transacciones/categorizar/${p.id}`}
              className="flex items-center gap-3 px-4 py-3 active:bg-amber-500/10"
            >
              <div className="flex-1 min-w-0 leading-tight">
                <p className="text-sm font-semibold truncate text-zinc-100">
                  {p.concepto || <span className="italic text-zinc-400">Sin concepto</span>}
                </p>
                <p className="text-xs text-zinc-400 truncate">
                  {p.fecha} · {p.cuenta_nombre ?? '—'}
                </p>
              </div>
              <p className={cn('text-sm font-bold tabular-nums text-emerald-400')}>
                +{formatMoney(Number(p.monto), p.moneda)}
              </p>
              <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
      {pendientes.length > 3 && (
        <Link
          href="/transacciones?sinCategoria=1"
          className="block text-center text-xs text-amber-300 py-2 border-t border-amber-500/20"
        >
          Ver los {pendientes.length - 3} restantes →
        </Link>
      )}
    </div>
  )
}
