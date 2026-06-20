import Link from 'next/link'
import { ChevronLeft, AlertTriangle, CheckCircle2, Activity, XCircle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type SearchParams = { level?: string; pendientes?: string }

export default async function ErroresPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Solo admin
  let esAdmin = false
  if (user) {
    const { data: prof } = await admin
      .from('profiles').select('roles(nombre)').eq('id', user.id).single()
    const rol = (prof?.roles as unknown as { nombre: string } | null)?.nombre
    esAdmin = rol === 'admin' || rol === 'socio'
  }

  if (!esAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-rose-300">Solo admin.</p>
      </div>
    )
  }

  // Verificar si tabla existe
  let tablaExiste = true
  try {
    const p = await admin.from('error_log').select('id').limit(1)
    if (p.error) tablaExiste = false
  } catch { tablaExiste = false }

  if (!tablaExiste) {
    return (
      <div className="px-4 pt-4 pb-24 max-w-3xl mx-auto">
        <Link href="/config" className="inline-flex items-center gap-1 text-sm text-zinc-400 mb-4">
          <ChevronLeft className="h-4 w-4" /> Config
        </Link>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-300 mx-auto mb-3" />
          <p className="text-lg font-bold text-amber-200">Aplica la migración 0049</p>
          <p className="text-xs text-zinc-500 mt-1">La tabla <code className="font-mono">error_log</code> no existe.</p>
        </div>
      </div>
    )
  }

  // Resumen últimas 24h
  const hace24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: ultimas24 } = await admin
    .from('error_log')
    .select('level, resuelto')
    .gte('created_at', hace24)

  const contadores = {
    info: 0, warn: 0, error: 0, fatal: 0,
    pendientes: 0, total: 0,
  }
  for (const e of ultimas24 ?? []) {
    contadores[e.level as keyof typeof contadores]++
    contadores.total++
    if (!e.resuelto) contadores.pendientes++
  }

  // Lista detallada
  let q = admin.from('error_log').select('*').order('created_at', { ascending: false }).limit(100)
  if (sp.level) q = q.eq('level', sp.level)
  if (sp.pendientes === '1') q = q.eq('resuelto', false)
  const { data: errores } = await q

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-3xl mx-auto">
      <Link href="/config" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Config
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
          <Activity className="h-6 w-6 text-cyan-400" />
          Salud del sistema
        </h1>
        <p className="text-[11px] text-zinc-500">Errores últimas 24h · {contadores.total} total</p>
      </header>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        <KpiCard label="Pendientes" value={contadores.pendientes} tone={contadores.pendientes === 0 ? 'emerald' : 'amber'} icon={<AlertTriangle className="h-3 w-3" />} />
        <KpiCard label="Fatales" value={contadores.fatal} tone={contadores.fatal === 0 ? 'emerald' : 'rose'} icon={<XCircle className="h-3 w-3" />} />
        <KpiCard label="Errores" value={contadores.error} tone={contadores.error === 0 ? 'emerald' : 'amber'} />
        <KpiCard label="Warnings" value={contadores.warn} tone="cyan" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip href="/config/errores" active={!sp.level && !sp.pendientes}>Todos</FilterChip>
        <FilterChip href="/config/errores?pendientes=1" active={sp.pendientes === '1'}>Sin resolver</FilterChip>
        <FilterChip href="/config/errores?level=fatal" active={sp.level === 'fatal'}>🚨 Fatales</FilterChip>
        <FilterChip href="/config/errores?level=error" active={sp.level === 'error'}>❌ Errores</FilterChip>
        <FilterChip href="/config/errores?level=warn" active={sp.level === 'warn'}>⚠️ Warnings</FilterChip>
      </div>

      {/* Lista */}
      {errores && errores.length > 0 ? (
        <ul className="space-y-2">
          {errores.map(e => (
            <li
              key={e.id as string}
              className={cn(
                'rounded-xl border p-3',
                e.level === 'fatal' && 'border-rose-500/40 bg-rose-500/5',
                e.level === 'error' && 'border-amber-500/30 bg-amber-500/5',
                e.level === 'warn' && 'border-cyan-500/20 bg-cyan-500/5',
                e.level === 'info' && 'border-zinc-700 bg-zinc-900/40',
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  'inline-flex items-center px-2 h-5 rounded-full text-[10px] font-bold uppercase tracking-wider border',
                  e.level === 'fatal' && 'bg-rose-500/20 border-rose-500/40 text-rose-200',
                  e.level === 'error' && 'bg-amber-500/20 border-amber-500/40 text-amber-200',
                  e.level === 'warn' && 'bg-cyan-500/15 border-cyan-500/30 text-cyan-200',
                  e.level === 'info' && 'bg-zinc-700/40 border-zinc-700 text-zinc-300',
                )}>
                  {e.level as string}
                </span>
                <span className="text-[10px] font-mono text-zinc-500">{e.source as string}</span>
                {e.resuelto && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
                <span className="ml-auto text-[10px] text-zinc-500 tabular-nums">
                  {new Date(e.created_at as string).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                </span>
              </div>
              <p className="text-sm text-zinc-200 break-words">{e.message as string}</p>
              {Boolean(e.context) && (
                <details className="mt-2">
                  <summary className="text-[10px] text-zinc-500 cursor-pointer">contexto</summary>
                  <pre className="text-[10px] text-zinc-400 mt-1 overflow-x-auto bg-black/40 p-2 rounded">
                    {JSON.stringify(e.context, null, 2)}
                  </pre>
                </details>
              )}
              {Boolean(e.stack) && (
                <details className="mt-1">
                  <summary className="text-[10px] text-zinc-500 cursor-pointer">stack trace</summary>
                  <pre className="text-[10px] text-zinc-500 mt-1 overflow-x-auto bg-black/40 p-2 rounded">
                    {(e.stack as string).slice(0, 1500)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-10 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
          <p className="text-base font-bold text-emerald-200">Sistema saludable</p>
          <p className="text-xs text-zinc-500 mt-1">Sin errores en las últimas 24 horas</p>
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, tone, icon }: { label: string; value: number; tone: 'emerald' | 'cyan' | 'amber' | 'rose'; icon?: React.ReactNode }) {
  const tones = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200',
    cyan:    'border-cyan-500/20 bg-cyan-500/5 text-cyan-200',
    amber:   'border-amber-500/30 bg-amber-500/5 text-amber-200',
    rose:    'border-rose-500/30 bg-rose-500/5 text-rose-200',
  }
  const valueTones = {
    emerald: 'text-emerald-300',
    cyan: 'text-cyan-300',
    amber: 'text-amber-300',
    rose: 'text-rose-300',
  }
  return (
    <div className={cn('rounded-xl border p-2.5 backdrop-blur-sm', tones[tone])}>
      <p className="text-[9px] uppercase tracking-wider font-bold inline-flex items-center gap-0.5">
        {icon}{label}
      </p>
      <p className={cn('text-xl font-black tabular-nums leading-tight', valueTones[tone])}>{value}</p>
    </div>
  )
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'h-8 px-3 rounded-full text-xs border transition-all inline-flex items-center',
        active ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
      )}
    >
      {children}
    </Link>
  )
}
