import Link from 'next/link'
import { Search, Receipt, CreditCard, PartyPopper, Calendar } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'

type SearchParams = { q?: string }

export default async function BuscarPage(
  { searchParams }: { searchParams: Promise<SearchParams> }
) {
  const sp = await searchParams
  const q = (sp.q || '').trim()

  const supabase = await createClient()

  let transacciones: any[] = []
  let porPagar: any[] = []
  let eventos: any[] = []
  let recurrentes: any[] = []

  if (q.length >= 2) {
    const like = `%${q}%`
    const [
      { data: tx },
      { data: pp },
      { data: ev },
      { data: rec },
    ] = await Promise.all([
      supabase
        .from('transacciones')
        .select('id, tipo, monto, moneda, fecha, concepto, categoria, negocios(nombre)')
        .or(`concepto.ilike.${like},categoria.ilike.${like}`)
        .order('fecha', { ascending: false })
        .limit(20),
      supabase
        .from('cuentas_por_pagar')
        .select('id, proveedor, concepto, monto_total, monto_pagado, moneda, estado, fecha_vencimiento')
        .or(`proveedor.ilike.${like},concepto.ilike.${like},referencia.ilike.${like}`)
        .order('fecha_vencimiento', { ascending: true })
        .limit(10),
      supabase
        .from('eventos')
        .select('id, cliente_nombre, tipo_evento, fecha_evento, monto_total, moneda, estado')
        .or(`cliente_nombre.ilike.${like},tipo_evento.ilike.${like}`)
        .order('fecha_evento', { ascending: false })
        .limit(10),
      supabase
        .from('gastos_recurrentes')
        .select('id, nombre, monto, moneda, frecuencia, proximo_pago')
        .ilike('nombre', like)
        .eq('activo', true)
        .limit(10),
    ])
    transacciones = tx ?? []
    porPagar = pp ?? []
    eventos = ev ?? []
    recurrentes = rec ?? []
  }

  const totalResultados = transacciones.length + porPagar.length + eventos.length + recurrentes.length

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <header className="space-y-2">
        <h1 className="text-2xl font-black heading-gradient">Buscar</h1>
        <form className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          <input
            name="q"
            type="search"
            placeholder="Proveedor, cliente, concepto, categoría..."
            defaultValue={q}
            autoFocus
            className="input-base w-full pl-10"
          />
        </form>
      </header>

      {q.length === 0 && (
        <div className="card border-dashed p-10 text-center space-y-2">
          <Search className="h-6 w-6 mx-auto text-zinc-500" />
          <p className="text-sm text-zinc-500">Escribe para buscar en toda la app</p>
          <p className="text-[10px] text-zinc-600">
            Busca en transacciones, cuentas por pagar, eventos, gastos fijos
          </p>
        </div>
      )}

      {q.length >= 1 && q.length < 2 && (
        <p className="text-sm text-zinc-500 text-center">Escribe al menos 2 letras</p>
      )}

      {q.length >= 2 && totalResultados === 0 && (
        <div className="card border-dashed p-8 text-center text-sm text-zinc-500">
          Sin resultados para &ldquo;{q}&rdquo;
        </div>
      )}

      {q.length >= 2 && totalResultados > 0 && (
        <p className="text-xs text-zinc-500">
          {totalResultados} resultado{totalResultados !== 1 ? 's' : ''} para &ldquo;<strong>{q}</strong>&rdquo;
        </p>
      )}

      {/* Transacciones */}
      {transacciones.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps inline-flex items-center gap-1"><Receipt className="h-3 w-3" /> Transacciones ({transacciones.length})</h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {transacciones.map((t) => {
              const neg = t.negocios as { nombre: string } | null
              const isGasto = t.tipo === 'gasto' || t.tipo === 'multa_interna'
              return (
                <li key={t.id}>
                  <Link href={`/transacciones/${t.id}`} className="flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)]">
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-sm font-medium text-white truncate">{t.concepto || 'Sin concepto'}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {formatearFecha(t.fecha, 'dd MMM')}
                        {t.categoria && ` · ${t.categoria}`}
                        {neg && ` · ${neg.nombre}`}
                      </p>
                    </div>
                    <p className={`text-sm font-bold tabular-nums ${isGasto ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {isGasto ? '−' : '+'}{formatMoney(Number(t.monto), t.moneda)}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Por pagar */}
      {porPagar.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps inline-flex items-center gap-1"><CreditCard className="h-3 w-3" /> Por Pagar ({porPagar.length})</h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {porPagar.map((c) => {
              const restante = Number(c.monto_total) - Number(c.monto_pagado)
              return (
                <li key={c.id}>
                  <Link href={`/por-pagar/${c.id}`} className="flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)]">
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-sm font-medium text-white truncate">{c.proveedor}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {c.concepto}
                        {c.fecha_vencimiento && ` · vence ${formatearFecha(c.fecha_vencimiento, 'dd MMM')}`}
                      </p>
                    </div>
                    <p className="text-sm font-bold tabular-nums text-rose-400">
                      {formatMoney(restante, c.moneda)}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Eventos */}
      {eventos.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps inline-flex items-center gap-1"><PartyPopper className="h-3 w-3" /> Eventos ({eventos.length})</h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {eventos.map((e) => (
              <li key={e.id}>
                <Link href={`/eventos/${e.id}`} className="flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)]">
                  <div className="flex-1 min-w-0 leading-tight">
                    <p className="text-sm font-medium text-white truncate">{e.cliente_nombre}</p>
                    <p className="text-xs text-zinc-500 truncate">
                      {e.tipo_evento ?? 'Evento'} · {formatearFecha(e.fecha_evento, 'dd MMM yyyy')}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-pink-400">
                    {formatMoney(Number(e.monto_total), e.moneda)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Gastos fijos */}
      {recurrentes.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Gastos Fijos ({recurrentes.length})</h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {recurrentes.map((r) => (
              <li key={r.id}>
                <Link href={`/recurrentes/${r.id}`} className="flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)]">
                  <div className="flex-1 min-w-0 leading-tight">
                    <p className="text-sm font-medium text-white truncate">{r.nombre}</p>
                    <p className="text-xs text-zinc-500 truncate">
                      {r.frecuencia} · próximo {r.proximo_pago}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-blue-400">
                    {formatMoney(Number(r.monto), r.moneda)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
