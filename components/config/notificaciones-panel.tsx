'use client'

import { useState } from 'react'
import { Loader2, Send, Sun, Coffee, Moon, AlertTriangle, Bot, Calendar, RefreshCw, DollarSign } from 'lucide-react'
import { toast } from '@/components/ui/toast'

type CronAccion = {
  tipo: string
  label: string
  descripcion: string
  icon: typeof Send
  color: string
}

const ACCIONES: CronAccion[] = [
  { tipo: 'saludo-manana',     label: 'Saludo de mañana', descripcion: '"Buenos días equipoo babys 🚀"', icon: Sun, color: 'text-amber-400' },
  { tipo: 'check-tarde',       label: 'Check de tarde',   descripcion: 'Reporte mediodía + recordatorio',  icon: Coffee, color: 'text-orange-400' },
  { tipo: 'cierre-noche',      label: 'Cierre de noche',  descripcion: 'Resumen del día + buenas noches',  icon: Moon, color: 'text-indigo-400' },
  { tipo: 'tareas-vencimiento',label: 'Tareas que vencen',descripcion: 'Tareas con vencimiento próximo',   icon: AlertTriangle, color: 'text-rose-400' },
  { tipo: 'notificaciones',    label: 'Procesar pendientes',descripcion: 'Envía las notificaciones programadas', icon: Send, color: 'text-cyan-400' },
  { tipo: 'auditor',           label: 'Insight del auditor', descripcion: 'Análisis IA del día',           icon: Bot, color: 'text-purple-400' },
  { tipo: 'recurrentes',       label: 'Avisar gastos fijos', descripcion: 'Gastos fijos próximos a vencer',icon: Calendar, color: 'text-blue-400' },
  { tipo: 'programar-notificaciones', label: 'Re-programar avisos', descripcion: 'Recalcula avisos pendientes',icon: RefreshCw, color: 'text-zinc-400' },
  { tipo: 'fx-rate',           label: 'Fetch tipo de cambio', descripcion: 'Actualiza USD/MXN del día',         icon: DollarSign, color: 'text-emerald-400' },
]

export function NotificacionesPanel() {
  const [pendingTipo, setPendingTipo] = useState<string | null>(null)

  const disparar = async (tipo: string, label: string) => {
    setPendingTipo(tipo)
    try {
      const res = await fetch(`/api/admin/disparar/${tipo}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        toast.error(`Falló: ${label}`, data.error || data.respuesta?.error || `Status ${data.status}`)
      } else {
        const enviados = data.respuesta?.enviados ?? data.respuesta?.successes ?? 0
        const errores = data.respuesta?.errors ?? data.respuesta?.fallos ?? 0
        toast.success(`${label} disparado`, `Push enviadas: ${enviados}${errores ? ` · ${errores} con error` : ''}`)
      }
    } catch (e) {
      toast.error('Error de red', e instanceof Error ? e.message : 'No se pudo conectar')
    } finally {
      setPendingTipo(null)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500 px-1">
        Si Vercel no disparó automáticamente, mándalas a mano. Te llega push si tienes activadas las notificaciones.
      </p>
      <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
        {ACCIONES.map((a) => {
          const Icon = a.icon
          const isPending = pendingTipo === a.tipo
          return (
            <li key={a.tipo}>
              <button
                type="button"
                onClick={() => disparar(a.tipo, a.label)}
                disabled={pendingTipo !== null}
                className="w-full flex items-center gap-3 p-3 hover:bg-[var(--bg-card-hover)] disabled:opacity-50 transition-colors text-left"
              >
                <Icon className={`h-5 w-5 ${a.color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{a.label}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{a.descripcion}</p>
                </div>
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                ) : (
                  <Send className="h-4 w-4 text-zinc-500" />
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
