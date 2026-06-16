/**
 * Card en /config que muestra las últimas 20 entradas del webhook_log.
 * Permite diagnosticar visualmente sin entrar a Supabase ni a Vercel logs.
 */
import { Activity, Check, AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export type WebhookLogRow = {
  id: string
  fuente: string
  ok: boolean | null
  payment_id: string | null
  payment_type: string | null
  error: string | null
  duracion_ms: number | null
  resultado: unknown
  created_at: string
}

const FUENTE_EMOJI: Record<string, string> = {
  webhook_mp: '🔔',
  cron_mp_sync: '⏰',
  cron_mp_sync_one: '🔄',
  auto_sync: '👁',
  manual_sync: '👆',
}

function formatHace(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`
  return `${Math.floor(ms / 86_400_000)}d`
}

export function WebhookLogCard({ rows }: { rows: WebhookLogRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="card p-3 text-center text-xs text-zinc-500">
        Aún sin actividad registrada. Cuando llegue un webhook o corra el cron, lo verás aquí.
      </div>
    )
  }

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Activity className="h-4 w-4 text-cyan-400" />
        <h3 className="text-sm font-bold text-white">Actividad reciente (últimas {rows.length})</h3>
      </div>
      <ul className="divide-y divide-[var(--border-subtle)]">
        {rows.map((r) => {
          const emoji = FUENTE_EMOJI[r.fuente] ?? '•'
          const okBadge = r.ok === true ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : r.ok === false ? (
            <AlertCircle className="h-3 w-3 text-rose-400" />
          ) : (
            <Clock className="h-3 w-3 text-zinc-400" />
          )
          return (
            <li key={r.id} className="py-2 flex items-start gap-2 text-xs">
              <span className="text-base shrink-0">{emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {okBadge}
                  <span className="font-mono text-zinc-300">{r.fuente}</span>
                  {r.payment_type && <span className="text-zinc-500">· {r.payment_type}</span>}
                  {r.payment_id && <span className="text-zinc-500 truncate">· id={r.payment_id.slice(-6)}</span>}
                </div>
                {r.error && (
                  <p className="text-rose-300 mt-0.5 truncate">{r.error}</p>
                )}
                {!r.error && typeof r.resultado === 'object' && r.resultado !== null && (
                  <p className="text-zinc-500 mt-0.5 truncate font-mono text-[10px]">
                    {JSON.stringify(r.resultado).slice(0, 100)}
                  </p>
                )}
              </div>
              <span className={cn('text-[10px] text-zinc-500 tabular-nums shrink-0', r.duracion_ms && r.duracion_ms > 5000 && 'text-amber-300')}>
                {formatHace(r.created_at)}
                {r.duracion_ms && r.duracion_ms > 100 ? ` · ${r.duracion_ms}ms` : ''}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
