import Link from 'next/link'
import { CreditCard, ChevronRight, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import { CobroForm } from '@/components/cobros/cobro-form'

const ESTADO_CHIP = {
  pendiente: { l: 'Pendiente', c: 'chip-yellow' },
  cobrado:   { l: '✓ Cobrado', c: 'chip-green' },
  expirado:  { l: 'Expirado',  c: '' },
  cancelado: { l: 'Cancelado', c: '' },
}

export default async function CobrosPage() {
  const supabase = await createClient()

  const [{ data: negocios }, { data: cobros }] = await Promise.all([
    supabase.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
    supabase
      .from('cobros_stripe')
      .select('id, descripcion, monto, moneda, estado, cliente_nombre, payment_url, created_at, cobrado_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const stripeConfigurado = !!process.env.STRIPE_SECRET_KEY

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black heading-gradient">Cobros Stripe</h1>
        <span className={cn('chip', stripeConfigurado ? 'chip-green' : 'chip-yellow')}>
          {stripeConfigurado ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </>
          ) : (
            <>⚠ Sin API key</>
          )}
        </span>
      </div>

      {!stripeConfigurado && (
        <div className="card border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
          <p className="text-sm font-bold text-amber-300">Stripe no configurado</p>
          <p className="text-xs text-amber-300/70">
            Pásame tu STRIPE_SECRET_KEY para activar los cobros. Mientras tanto este form no genera links.
          </p>
        </div>
      )}

      {/* Form de generar cobro */}
      <div className="card-glow p-5 space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-cyan-400" />
          <h2 className="text-base font-bold text-white">Generar cobro</h2>
        </div>
        <CobroForm negocios={negocios ?? []} />
      </div>

      {/* Histórico */}
      {cobros && cobros.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps">Recientes ({cobros.length})</h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {cobros.map((c) => {
              const estado = ESTADO_CHIP[c.estado as keyof typeof ESTADO_CHIP] || ESTADO_CHIP.pendiente
              return (
                <li key={c.id} className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white truncate flex-1">{c.descripcion}</p>
                    <p className={cn(
                      'text-sm font-bold tabular-nums shrink-0',
                      c.estado === 'cobrado' ? 'text-emerald-400' : 'text-zinc-300'
                    )}>
                      {formatMoney(Number(c.monto), c.moneda as 'MXN' | 'USD')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn('chip text-[9px] h-5 px-2', estado.c)}>{estado.l}</span>
                    {c.cliente_nombre && <span className="text-[10px] text-zinc-500">👤 {c.cliente_nombre}</span>}
                    <span className="text-[10px] text-zinc-500">
                      {formatearFecha(c.created_at.slice(0, 10), 'dd MMM')}
                    </span>
                    {c.payment_url && c.estado === 'pendiente' && (
                      <a
                        href={c.payment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-cyan-400 inline-flex items-center gap-0.5 ml-auto"
                      >
                        Ver link <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
