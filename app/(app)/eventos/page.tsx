import Link from 'next/link'
import { Calendar, ChevronRight, PartyPopper } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha, hoyEnCabos } from '@/lib/fechas'

const ESTADO_CHIP = {
  reservado:        { l: 'Reservado',     c: 'chip-yellow' },
  confirmado:       { l: 'Confirmado',    c: 'chip-cyan' },
  realizado:        { l: 'Realizado',     c: 'chip-green' },
  pagado_proveedor: { l: '✓ Pagado',      c: 'chip-green' },
  cancelado:        { l: 'Cancelado',     c: '' },
}

export default async function EventosPage() {
  const supabase = await createClient()

  const { data: eventos } = await supabase
    .from('eventos')
    .select('id, cliente_nombre, fecha_evento, monto_total, moneda, estado, tipo_evento, negocios(nombre)')
    .order('fecha_evento', { ascending: true })

  const hoy = hoyEnCabos()
  const futuros = (eventos ?? []).filter((e) => e.fecha_evento >= hoy && e.estado !== 'cancelado')
  const pasados = (eventos ?? []).filter((e) => e.fecha_evento < hoy || e.estado === 'realizado' || e.estado === 'pagado_proveedor')

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black heading-gradient">Eventos</h1>
        <span className="chip">{futuros.length} próximos</span>
      </div>

      {/* Próximos */}
      {futuros.length > 0 ? (
        <section className="space-y-2">
          <h2 className="label-caps">Próximos</h2>
          <ul className="space-y-2">
            {futuros.map((e) => {
              const neg = e.negocios as unknown as { nombre: string } | null
              const estado = ESTADO_CHIP[e.estado as keyof typeof ESTADO_CHIP] || ESTADO_CHIP.reservado
              return (
                <li key={e.id}>
                  <Link href={`/eventos/${e.id}`} className="card-glow flex items-center gap-3 p-4 hover:bg-[var(--bg-card-hover)] transition-colors">
                    <div className="h-12 w-12 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-xl shrink-0">
                      🎉
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="font-bold text-white truncate">{e.cliente_nombre}</p>
                      <p className="text-xs text-zinc-400 truncate">
                        {e.tipo_evento ? `${e.tipo_evento} · ` : ''}
                        {formatearFecha(e.fecha_evento, 'EEEE dd MMM yyyy')}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={cn('chip text-[9px] h-5 px-2', estado.c)}>{estado.l}</span>
                        {neg && <span className="chip text-[9px] h-5 px-2">{neg.nombre}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums text-white">
                        {formatMoney(Number(e.monto_total), e.moneda as 'MXN' | 'USD')}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-zinc-500" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ) : (
        <div className="card border-dashed p-10 text-center space-y-3">
          <PartyPopper className="h-8 w-8 mx-auto text-purple-400" />
          <p className="text-sm text-zinc-400">
            Sin eventos próximos. Toca <strong>+</strong> para agregar una reserva.
          </p>
        </div>
      )}

      {/* Pasados */}
      {pasados.length > 0 && (
        <section className="space-y-2 opacity-70">
          <h2 className="label-caps">Pasados</h2>
          <ul className="space-y-2">
            {pasados.slice(0, 10).map((e) => {
              const estado = ESTADO_CHIP[e.estado as keyof typeof ESTADO_CHIP] || ESTADO_CHIP.realizado
              return (
                <li key={e.id}>
                  <Link href={`/eventos/${e.id}`} className="card flex items-center gap-3 p-3">
                    <Calendar className="h-4 w-4 text-zinc-500 shrink-0" />
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-sm font-medium truncate">{e.cliente_nombre}</p>
                      <p className="text-xs text-zinc-500">{formatearFecha(e.fecha_evento, 'dd MMM yyyy')}</p>
                    </div>
                    <span className={cn('chip text-[9px] h-5 px-2', estado.c)}>{estado.l}</span>
                    <p className="text-xs font-bold tabular-nums">{formatMoney(Number(e.monto_total), e.moneda as 'MXN' | 'USD')}</p>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

    </div>
  )
}
