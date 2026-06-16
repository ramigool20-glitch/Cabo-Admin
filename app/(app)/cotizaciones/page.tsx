import Link from 'next/link'
import { FileText, Plus, ChevronRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney, cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const ESTADO_META: Record<string, { label: string; color: string }> = {
  borrador:    { label: 'Borrador',     color: 'bg-zinc-700/40 text-zinc-300 border-zinc-700' },
  enviada:     { label: 'Enviada',      color: 'bg-cyan-500/15 text-cyan-200 border-cyan-500/30' },
  aceptada:    { label: 'Aceptada',     color: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30' },
  rechazada:   { label: 'Rechazada',    color: 'bg-rose-500/15 text-rose-200 border-rose-500/30' },
  expirada:    { label: 'Expirada',     color: 'bg-amber-500/15 text-amber-200 border-amber-500/30' },
  convertida:  { label: 'Vendida ✓',    color: 'bg-emerald-500/20 text-emerald-100 border-emerald-500/40' },
}

const TIPO_EMOJI: Record<string, string> = {
  farmacia: '💊', consultorio: '🩺', pagina_digital: '🌐', general: '🏢',
}

export default async function CotizacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ negocio?: string; estado?: string }>
}) {
  const sp = await searchParams
  const admin = createAdminClient()

  // Defensive: tabla cotizaciones puede no existir aún
  let cotizaciones: Array<Record<string, unknown>> | null = null
  let tablaPendiente = false
  try {
    let q = admin
      .from('cotizaciones')
      .select('id, folio, cliente_nombre, total_mxn, estado, created_at, vigencia_dias, negocio_id, negocios(nombre, tipo)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (sp.negocio) q = q.eq('negocio_id', sp.negocio)
    if (sp.estado) q = q.eq('estado', sp.estado)
    const { data, error } = await q
    if (error) tablaPendiente = true
    else cotizaciones = data as Array<Record<string, unknown>>
  } catch {
    tablaPendiente = true
  }

  const { data: negocios } = await admin
    .from('negocios')
    .select('id, nombre, tipo')
    .eq('activo', true)
    .neq('nombre', 'Rancho McCoy')
    .order('nombre')

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
            <FileText className="h-6 w-6 text-cyan-400" />
            Cotizaciones
          </h1>
          <p className="text-[11px] text-zinc-500 mt-0.5">Genera imagen profesional por negocio</p>
        </div>
        <Link
          href="/cotizaciones/nueva"
          className="h-10 px-3 rounded-full bg-gradient-to-r from-cyan-600 to-emerald-600 text-white text-sm font-bold inline-flex items-center gap-1.5 shadow-lg shadow-cyan-500/30 active:scale-95 transition-transform"
        >
          <Plus className="h-4 w-4" />
          Nueva
        </Link>
      </header>

      {tablaPendiente && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200 space-y-1">
          <p className="font-bold">Aplica la migración 0042 en Supabase</p>
          <p className="text-zinc-400">
            La tabla <code className="font-mono">cotizaciones</code> aún no existe. Corre el SQL de{' '}
            <code className="font-mono">supabase/migrations/0042_cotizaciones.sql</code>.
          </p>
        </div>
      )}

      {/* Chips filtro de negocio */}
      {negocios && negocios.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <FilterChip href="/cotizaciones" active={!sp.negocio}>Todos</FilterChip>
          {negocios.map(n => (
            <FilterChip
              key={n.id}
              href={`/cotizaciones?negocio=${n.id}`}
              active={sp.negocio === n.id}
            >
              {TIPO_EMOJI[n.tipo as string] ?? '🏢'} {n.nombre}
            </FilterChip>
          ))}
        </div>
      )}

      {/* Lista */}
      {cotizaciones && cotizaciones.length === 0 && !tablaPendiente && (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center space-y-3">
          <FileText className="h-10 w-10 text-zinc-600 mx-auto" />
          <p className="text-sm text-zinc-400">Aún no hay cotizaciones</p>
          <Link
            href="/cotizaciones/nueva"
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-emerald-600 text-white text-sm font-bold"
          >
            <Plus className="h-4 w-4" />
            Crear la primera
          </Link>
        </div>
      )}

      <ul className="space-y-2">
        {(cotizaciones ?? []).map(c => {
          const negocio = c.negocios as { nombre?: string; tipo?: string } | null
          const estado = ESTADO_META[c.estado as string] ?? ESTADO_META.borrador
          const fecha = new Date(c.created_at as string).toLocaleDateString('es-MX', {
            day: '2-digit', month: 'short', year: 'numeric',
          })
          return (
            <li key={c.id as string}>
              <Link
                href={`/cotizaciones/${c.id}`}
                className="block rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3 hover:border-cyan-500/40 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl shrink-0">
                    {TIPO_EMOJI[negocio?.tipo ?? 'general']}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <span className={cn(
                        'inline-flex items-center px-2 h-5 rounded-full text-[9px] font-bold uppercase tracking-wider border',
                        estado.color
                      )}>
                        {estado.label}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">{c.folio as string}</span>
                    </div>
                    <p className="text-sm font-bold text-zinc-100 truncate">
                      {c.cliente_nombre as string}
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate">
                      {negocio?.nombre ?? 'Sin negocio'} · {fecha}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-black text-emerald-300 tabular-nums leading-none">
                      {formatMoney(Number(c.total_mxn ?? 0), 'MXN')}
                    </p>
                    <ChevronRight className="h-4 w-4 text-zinc-600 ml-auto mt-1 group-hover:text-cyan-400 transition-colors" />
                  </div>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'shrink-0 h-8 px-3 rounded-full text-xs border transition-all inline-flex items-center gap-1',
        active
          ? 'border-cyan-500 bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
          : 'border-[var(--border-subtle)] text-zinc-400 hover:border-zinc-500'
      )}
    >
      {children}
    </Link>
  )
}
