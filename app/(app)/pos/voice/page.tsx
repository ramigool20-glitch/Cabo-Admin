import Link from 'next/link'
import { ChevronLeft, Mic, AlertCircle, MessageCircle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type SearchParams = { categoria?: string }

const EMOJI_CAT: Record<string, string> = {
  precio: '💲', cancelacion: '🚫', devolucion: '↩️',
  problema: '😡', fiado: '📝', general: 'ℹ️',
}

export default async function VoicePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

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

  let tablaExiste = true
  try {
    const p = await admin.from('voice_events').select('id').limit(1)
    if (p.error) tablaExiste = false
  } catch { tablaExiste = false }

  if (!tablaExiste) {
    return (
      <div className="px-4 pt-4 pb-24 max-w-3xl mx-auto">
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-zinc-400 mb-4">
          <ChevronLeft className="h-4 w-4" /> Dashboard
        </Link>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <AlertCircle className="h-12 w-12 text-amber-300 mx-auto mb-3" />
          <p className="text-lg font-bold text-amber-200">Aplica la migración 0050</p>
          <p className="text-xs text-zinc-500 mt-1">La tabla <code className="font-mono">voice_events</code> no existe.</p>
        </div>
      </div>
    )
  }

  let q = admin.from('voice_events').select('*').order('created_at', { ascending: false }).limit(50)
  if (sp.categoria) q = q.eq('categoria', sp.categoria)
  const { data: eventos } = await q

  // Auditoría diaria
  const hoy = new Date().toISOString().slice(0, 10)
  const { data: ventasEscuchadas } = await admin
    .from('voice_events')
    .select('monto_detectado_mxn, idioma')
    .eq('es_venta_potencial', true)
    .gte('created_at', `${hoy}T00:00:00`)
  const totalEscuchado = (ventasEscuchadas ?? []).reduce((s, e) => s + Number(e.monto_detectado_mxn ?? 0), 0)
  const turistasIngles = (ventasEscuchadas ?? []).filter(e => e.idioma === 'en').length
  const { data: txsCobradas } = await admin
    .from('transacciones')
    .select('monto_mxn_equivalente, monto')
    .eq('tiene_items', true)
    .eq('tipo', 'ingreso')
    .gte('fecha', hoy)
  const totalCobrado = (txsCobradas ?? []).reduce((s, t) => s + Number(t.monto_mxn_equivalente ?? t.monto ?? 0), 0)
  const diferencia = totalEscuchado - totalCobrado
  const base = Math.max(totalEscuchado, totalCobrado, 1)
  const porcentajeDif = Math.abs(diferencia / base) * 100
  const alertaAuditoria = porcentajeDif > 10 && Math.abs(diferencia) > 200

  // Conteos por categoría últimas 24h
  const hace24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: ult24 } = await admin
    .from('voice_events')
    .select('categoria, analisis_accion')
    .gte('created_at', hace24)
  const contadores = (ult24 ?? []).reduce((acc, e) => {
    acc[e.categoria as string] = (acc[e.categoria as string] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-3xl mx-auto">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Dashboard
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
          <Mic className="h-6 w-6 text-cyan-400" />
          Monitor de voz
        </h1>
        <p className="text-[11px] text-zinc-500">
          Eventos detectados por la IA · {eventos?.length ?? 0} en pantalla
        </p>
      </header>

      {/* Auditoría del día */}
      {totalEscuchado > 0 && (
        <div className={cn(
          'rounded-2xl border p-4 space-y-2',
          alertaAuditoria
            ? 'border-rose-500/40 bg-rose-500/5'
            : 'border-emerald-500/30 bg-emerald-500/5'
        )}>
          <p className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">
            📢 Auditoría del día
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase">Escuchado en conversación</p>
              <p className="text-xl font-black text-emerald-300 tabular-nums">
                ${totalEscuchado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase">Cobrado en POS</p>
              <p className="text-xl font-black text-cyan-300 tabular-nums">
                ${totalCobrado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <div className="border-t border-zinc-800 pt-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-bold text-zinc-500">Diferencia</span>
            <span className={cn(
              'text-lg font-black tabular-nums',
              alertaAuditoria ? 'text-rose-300' : 'text-emerald-300'
            )}>
              {diferencia >= 0 ? '+' : ''}${Math.abs(diferencia).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ({porcentajeDif.toFixed(1)}%)
            </span>
          </div>
          <p className={cn('text-[10px]', alertaAuditoria ? 'text-rose-300' : 'text-emerald-300')}>
            {alertaAuditoria
              ? '⚠ Discrepancia mayor al 10% — revisar'
              : '✓ Dentro del margen normal'}
          </p>
          {turistasIngles > 0 && (
            <p className="text-[10px] text-zinc-500">🇺🇸 {turistasIngles} clientes en inglés atendidos hoy</p>
          )}
        </div>
      )}

      {/* Conteos por categoría 24h */}
      {Object.keys(contadores).length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {['precio', 'cancelacion', 'devolucion', 'problema', 'fiado', 'general'].map(cat => {
            const n = contadores[cat] ?? 0
            return (
              <div key={cat} className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-2 text-center">
                <p className="text-lg">{EMOJI_CAT[cat]}</p>
                <p className="text-base font-black text-zinc-100 tabular-nums">{n}</p>
                <p className="text-[9px] text-zinc-500 uppercase tracking-wider truncate">{cat}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip href="/pos/voice" active={!sp.categoria}>Todos</FilterChip>
        {['precio', 'cancelacion', 'devolucion', 'problema', 'fiado', 'general'].map(cat => (
          <FilterChip key={cat} href={`/pos/voice?categoria=${cat}`} active={sp.categoria === cat}>
            {EMOJI_CAT[cat]} {cat}
          </FilterChip>
        ))}
      </div>

      {/* Lista */}
      {eventos && eventos.length > 0 ? (
        <ul className="space-y-2">
          {eventos.map(e => {
            const hora = new Date(e.created_at as string)
            return (
              <li
                key={e.id as string}
                className={cn(
                  'rounded-xl border p-3',
                  e.analisis_accion === 'urgente' && 'border-rose-500/40 bg-rose-500/5',
                  e.analisis_accion === 'revisar' && 'border-amber-500/30 bg-amber-500/5',
                  (!e.analisis_accion || e.analisis_accion === 'nada') && 'border-zinc-700 bg-zinc-900/40',
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base">{EMOJI_CAT[e.categoria as string] ?? '🎙️'}</span>
                  <span className="text-[10px] uppercase tracking-wider font-bold text-zinc-400">
                    {e.categoria as string}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">"{e.keyword as string}"</span>
                  <span className="ml-auto text-[10px] text-zinc-500">
                    {hora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {hora.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
                <p className="text-sm font-bold text-zinc-100">{e.profile_nombre as string}</p>
                {e.analisis_resumen ? (
                  <p className="text-[11px] text-cyan-300/90 italic mt-1">
                    🤖 {e.analisis_resumen as string}
                  </p>
                ) : (
                  <p className="text-[11px] text-zinc-500 italic mt-1">
                    Procesando análisis IA…
                  </p>
                )}
                {e.analisis_tono && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className={cn(
                      'inline-flex items-center px-1.5 h-4 rounded text-[9px] font-bold uppercase tracking-wider',
                      e.analisis_tono === 'positivo' && 'bg-emerald-500/15 text-emerald-300',
                      e.analisis_tono === 'normal' && 'bg-zinc-700 text-zinc-300',
                      e.analisis_tono === 'tenso' && 'bg-amber-500/15 text-amber-300',
                      e.analisis_tono === 'queja' && 'bg-rose-500/15 text-rose-300',
                    )}>
                      {e.analisis_tono as string}
                    </span>
                    {e.analisis_accion && e.analisis_accion !== 'nada' && (
                      <span className={cn(
                        'inline-flex items-center px-1.5 h-4 rounded text-[9px] font-bold uppercase tracking-wider',
                        e.analisis_accion === 'urgente' && 'bg-rose-500/20 text-rose-200',
                        e.analisis_accion === 'revisar' && 'bg-amber-500/20 text-amber-200',
                      )}>
                        → {e.analisis_accion as string}
                      </span>
                    )}
                  </div>
                )}
                <details className="mt-2">
                  <summary className="text-[10px] text-zinc-500 cursor-pointer">📝 Ver transcripción</summary>
                  <p className="text-[10px] text-zinc-400 italic mt-1 bg-black/40 p-2 rounded">
                    "{e.transcript as string}"
                  </p>
                </details>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/40 p-10 text-center">
          <MessageCircle className="h-10 w-10 text-zinc-600 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">Sin eventos de voz detectados aún</p>
          <p className="text-[10px] text-zinc-600 mt-1">
            Tania debe permitir el micrófono en el POS para que se active
          </p>
        </div>
      )}
    </div>
  )
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'h-8 px-3 rounded-full text-xs border transition-all inline-flex items-center gap-1',
        active ? 'border-cyan-500 bg-cyan-500 text-white' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
      )}
    >
      {children}
    </Link>
  )
}
