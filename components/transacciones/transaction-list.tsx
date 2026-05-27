'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowUpCircle, ArrowDownCircle, Gavel, ArrowLeftRight, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'

export type Transaccion = {
  id: string
  tipo: 'ingreso' | 'gasto' | 'multa_interna' | 'liquidacion_socio'
  monto: number
  moneda: 'MXN' | 'USD'
  fecha: string
  concepto: string | null
  categoria: string | null
  negocios: { nombre: string; tipo?: string | null } | null
  cuentas: { nombre: string } | null
  monto_mxn_equivalente?: number | null
  tipo_cambio_usado?: number | null
  atribuido_a?: string | null
}

const tipoMeta = {
  ingreso:           { icon: ArrowUpCircle,   color: 'text-emerald-600' },
  gasto:             { icon: ArrowDownCircle, color: 'text-red-600' },
  multa_interna:     { icon: Gavel,           color: 'text-amber-600' },
  liquidacion_socio: { icon: ArrowLeftRight,  color: 'text-blue-600' },
} as const

export function TransactionList({ transacciones }: { transacciones: Transaccion[] }) {
  const router = useRouter()

  // Realtime: cuando llega cualquier cambio en transacciones, refrescamos la página.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('transacciones-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transacciones' },
        () => router.refresh()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  if (transacciones.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-card)] p-10 text-center space-y-3">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
          <ArrowUpCircle className="h-6 w-6" />
        </div>
        <p className="text-sm text-zinc-400">
          Sin transacciones todavía. Toca el botón <strong>+</strong> abajo a la derecha para capturar la primera.
        </p>
      </div>
    )
  }

  // Agrupar por fecha
  const grupos = new Map<string, Transaccion[]>()
  for (const t of transacciones) {
    if (!grupos.has(t.fecha)) grupos.set(t.fecha, [])
    grupos.get(t.fecha)!.push(t)
  }

  return (
    <div className="space-y-5">
      {Array.from(grupos.entries()).map(([fecha, items]) => (
        <section key={fecha} className="space-y-1.5">
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide px-1">
            {formatearFecha(fecha, 'EEEE, dd MMM')}
          </h2>
          <ul className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] divide-y divide-[var(--border-subtle)] overflow-hidden">
            {items.map((t) => {
              const meta = tipoMeta[t.tipo]
              const Icon = meta.icon
              const editable = t.tipo === 'ingreso' || t.tipo === 'gasto'
              return (
                <li key={t.id}>
                  <Link
                    href={editable ? `/transacciones/${t.id}` : '#'}
                    className={cn(
                      'flex items-center gap-3 p-3 active:bg-zinc-50 dark:active:bg-zinc-800/50',
                      !editable && 'pointer-events-none'
                    )}
                  >
                    <Icon className={cn('h-9 w-9 shrink-0', meta.color)} strokeWidth={1.7} />
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-sm font-medium truncate">
                        {t.concepto || t.categoria || (
                          <span className="text-zinc-400 italic">Sin concepto</span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">
                        {t.negocios?.nombre ?? '—'} · {t.cuentas?.nombre ?? '—'}
                      </p>
                      {t.negocios?.tipo === 'casa' && (
                        <p className="text-[9px] mt-0.5">
                          {t.atribuido_a
                            ? <span className="text-purple-300">👤 personal</span>
                            : <span className="text-cyan-300">⚖ compartido</span>}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={cn('text-sm font-semibold tabular-nums', meta.color)}>
                        {t.tipo === 'gasto' || t.tipo === 'multa_interna' ? '−' : '+'}
                        {formatMoney(Number(t.monto), t.moneda)}
                      </p>
                      {t.moneda === 'USD' && t.monto_mxn_equivalente != null ? (
                        <p className="text-[10px] text-zinc-500 tabular-nums">
                          ≈ {formatMoney(Number(t.monto_mxn_equivalente), 'MXN')}
                        </p>
                      ) : (
                        <p className="text-[10px] text-zinc-400 uppercase">{t.moneda}</p>
                      )}
                    </div>
                    {editable && <ChevronRight className="h-4 w-4 text-zinc-300 shrink-0" />}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
