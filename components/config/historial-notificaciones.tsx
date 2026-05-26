import { createAdminClient } from '@/lib/supabase/admin'
import { formatearFecha } from '@/lib/fechas'
import { formatInTimeZone } from 'date-fns-tz'
import { TZ } from '@/lib/fechas'
import { Bell, Check, Clock } from 'lucide-react'

export async function HistorialNotificaciones() {
  const admin = createAdminClient()
  const { data: notifs } = await admin
    .from('notificaciones_programadas')
    .select('id, tipo, titulo, mensaje, fecha_disparo, enviada, enviada_at, created_at')
    .order('fecha_disparo', { ascending: false })
    .limit(15)

  const lista = notifs ?? []

  if (lista.length === 0) {
    return (
      <div className="card border-dashed p-6 text-center text-sm text-zinc-500">
        Aún no hay historial de notificaciones.
      </div>
    )
  }

  return (
    <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
      {lista.map((n) => {
        const hora = n.enviada_at
          ? formatInTimeZone(new Date(n.enviada_at), TZ, 'dd MMM HH:mm')
          : formatInTimeZone(new Date(n.fecha_disparo), TZ, 'dd MMM HH:mm')
        return (
          <li key={n.id} className="p-3">
            <div className="flex items-start gap-3">
              {n.enviada ? (
                <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <Clock className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0 leading-tight">
                <p className="text-sm font-medium text-white truncate">{n.titulo}</p>
                <p className="text-xs text-zinc-500 line-clamp-2">{n.mensaje}</p>
                <p className="text-[10px] text-zinc-600 mt-1">
                  {n.tipo} · {hora}
                  {!n.enviada && <span className="text-amber-400"> · programada</span>}
                </p>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
