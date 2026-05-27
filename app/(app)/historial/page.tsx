import Link from 'next/link'
import { History, Plus, Edit3, Trash2, ChevronRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { cn, formatMoney } from '@/lib/utils'
import { TZ } from '@/lib/fechas'
import { formatInTimeZone } from 'date-fns-tz'
import { EmptyState } from '@/components/ui/empty-state'

type SearchParams = {
  socio?: string
  accion?: string
}

export default async function HistorialPage(
  { searchParams }: { searchParams: Promise<SearchParams> }
) {
  const sp = await searchParams
  const admin = createAdminClient()

  // Try to fetch — table may not exist if 0013 not applied
  let entries: Array<{
    id: string
    transaccion_id: string | null
    accion: 'creada' | 'editada' | 'eliminada'
    cambios: Record<string, { antes: unknown; despues: unknown }> | null
    snapshot: Record<string, unknown> | null
    modificada_por: string | null
    created_at: string
  }> = []
  let tableExists = true
  try {
    let q = admin
      .from('transaccion_historial')
      .select('id, transaccion_id, accion, cambios, snapshot, modificada_por, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
    if (sp.socio) q = q.eq('modificada_por', sp.socio)
    if (sp.accion && ['creada', 'editada', 'eliminada'].includes(sp.accion)) {
      q = q.eq('accion', sp.accion)
    }
    const { data, error } = await q
    if (error) { tableExists = false }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    entries = (data as any[]) ?? []
  } catch {
    tableExists = false
  }

  // Cargar nombres de socios + negocios para mostrar contexto
  const { data: socios } = await admin
    .from('profiles')
    .select('id, nombre, role_id, roles(nombre)')
    .eq('activo', true)
  const sociosFiltered = (socios ?? []).filter((p) => {
    const r = p.roles as unknown as { nombre: string } | null
    return r?.nombre === 'admin' || r?.nombre === 'socio'
  })
  const nombrePorId = new Map(sociosFiltered.map((p) => [p.id, p.nombre]))

  const { data: negocios } = await admin.from('negocios').select('id, nombre')
  const negocioNombre = new Map((negocios ?? []).map((n) => [n.id, n.nombre]))

  // KPIs
  const totalHoy = entries.filter((e) => {
    const hoy = new Date().toISOString().slice(0, 10)
    return e.created_at.slice(0, 10) === hoy
  }).length
  const porSocio = new Map<string, number>()
  for (const e of entries) {
    if (!e.modificada_por) continue
    porSocio.set(e.modificada_por, (porSocio.get(e.modificada_por) ?? 0) + 1)
  }

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
            <History className="h-6 w-6 text-cyan-400" />
            Historial
          </h1>
          <span className="chip chip-cyan">{entries.length} eventos</span>
        </div>
        <p className="text-sm text-zinc-400">Auditoría completa de cambios en transacciones · últimas 100.</p>
      </header>

      {!tableExists && (
        <div className="card border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-300">
          <p className="font-bold">Tabla historial no encontrada</p>
          <p className="text-[11px] text-amber-200/70 mt-1">
            Pega la migración 0013_tx_historial.sql en Supabase para activar el historial.
          </p>
        </div>
      )}

      {/* KPIs */}
      {entries.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="card p-3">
            <p className="text-[10px] text-zinc-500">Eventos hoy</p>
            <p className="text-lg font-bold text-cyan-300 tabular-nums">{totalHoy}</p>
          </div>
          <div className="card p-3 space-y-1">
            <p className="text-[10px] text-zinc-500">Por socio</p>
            {Array.from(porSocio.entries()).slice(0, 3).map(([id, count]) => (
              <p key={id} className="text-[11px]">
                <span className="text-zinc-300">{nombrePorId.get(id) ?? '—'}: </span>
                <span className="font-bold tabular-nums text-cyan-300">{count}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip href="/historial" label="Todos" active={!sp.socio && !sp.accion} />
        {sociosFiltered.map((s) => {
          const qs = new URLSearchParams()
          qs.set('socio', s.id)
          if (sp.accion) qs.set('accion', sp.accion)
          return (
            <FilterChip
              key={s.id}
              href={`/historial?${qs.toString()}`}
              label={`👤 ${s.nombre}`}
              active={sp.socio === s.id}
            />
          )
        })}
        {(['creada', 'editada', 'eliminada'] as const).map((a) => {
          const qs = new URLSearchParams()
          if (sp.socio) qs.set('socio', sp.socio)
          qs.set('accion', a)
          const emoji = a === 'creada' ? '➕' : a === 'editada' ? '✏' : '🗑'
          return (
            <FilterChip
              key={a}
              href={`/historial?${qs.toString()}`}
              label={`${emoji} ${a}`}
              active={sp.accion === a}
            />
          )
        })}
      </div>

      {/* Lista */}
      {entries.length === 0 ? (
        <EmptyState
          emoji="📜"
          title="Sin historial todavía"
          description="Cuando crees, edites o borres una transacción aparecerá aquí con tu nombre."
        />
      ) : (
        <ul className="space-y-1.5">
          {entries.map((h) => {
            const IconHist = h.accion === 'creada' ? Plus : h.accion === 'editada' ? Edit3 : Trash2
            const iconColor =
              h.accion === 'creada' ? 'text-emerald-400'
              : h.accion === 'editada' ? 'text-cyan-400'
              : 'text-rose-400'
            const bgColor =
              h.accion === 'creada' ? 'bg-emerald-500/10'
              : h.accion === 'editada' ? 'bg-cyan-500/10'
              : 'bg-rose-500/10'
            const fechaLocal = formatInTimeZone(new Date(h.created_at), TZ, 'dd MMM HH:mm')
            const socio = h.modificada_por ? nombrePorId.get(h.modificada_por) : null
            const snap = h.snapshot as Record<string, unknown> | null
            const monto = snap?.monto
            const moneda = (snap?.moneda as 'MXN' | 'USD') ?? 'MXN'
            const concepto = (snap?.concepto as string) || (snap?.categoria as string) || 'sin descripción'
            const negocioId = snap?.negocio_id as string | undefined
            const negNombre = negocioId ? negocioNombre.get(negocioId) : null
            const isTipoGasto = snap?.tipo === 'gasto' || snap?.tipo === 'multa_interna'

            return (
              <li key={h.id}>
                <Link
                  href={h.transaccion_id ? `/transacciones/${h.transaccion_id}` : '#'}
                  className={cn(
                    'card flex items-start gap-3 p-3 transition-colors',
                    h.transaccion_id
                      ? 'hover:bg-[var(--bg-card-hover)]'
                      : 'opacity-60 pointer-events-none'
                  )}
                >
                  <div className={cn('h-8 w-8 rounded-lg inline-flex items-center justify-center shrink-0', bgColor)}>
                    <IconHist className={cn('h-4 w-4', iconColor)} />
                  </div>
                  <div className="flex-1 min-w-0 leading-tight">
                    <p className="text-sm text-white truncate">
                      <span className="font-bold">{socio ?? '—'}</span>{' '}
                      <span className="text-zinc-500">{h.accion}</span>{' '}
                      <span className="text-zinc-300">{concepto}</span>
                    </p>
                    <p className="text-[10px] text-zinc-500 truncate">
                      {fechaLocal}
                      {negNombre && ` · ${negNombre}`}
                      {!h.transaccion_id && ' · tx eliminada'}
                    </p>
                    {h.accion === 'editada' && h.cambios && Object.keys(h.cambios).length > 0 && (
                      <p className="text-[10px] text-zinc-500 mt-0.5 truncate">
                        {Object.keys(h.cambios).slice(0, 3).map(c => c.replace(/_/g, ' ')).join(' · ')}
                        {Object.keys(h.cambios).length > 3 && ' ...'}
                      </p>
                    )}
                  </div>
                  {typeof monto === 'number' && (
                    <p className={cn('text-sm font-bold tabular-nums shrink-0', isTipoGasto ? 'text-rose-400' : 'text-emerald-400')}>
                      {isTipoGasto ? '−' : '+'}{formatMoney(monto, moneda)}
                    </p>
                  )}
                  {h.transaccion_id && <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'h-7 px-2.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors',
        active ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300' : 'border-[var(--border-subtle)] text-zinc-500 hover:text-white'
      )}
    >
      {label}
    </Link>
  )
}
