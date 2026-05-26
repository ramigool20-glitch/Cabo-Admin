'use client'

import { useState } from 'react'
import { Stethoscope, Loader2, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { toast } from '@/components/ui/toast'

type Suscripcion = {
  id: string
  socio: string
  proveedor: string
  endpoint_corto: string
  user_agent: string
  creada: string
  resultado?: string
  accion?: string
}

type DebugResult = {
  ok: boolean
  env: Record<string, boolean>
  total_suscripciones: number
  suscripciones: Suscripcion[]
  eliminadas: number
  error?: string
}

export function DiagnosticoPush() {
  const [pending, setPending] = useState(false)
  const [resultado, setResultado] = useState<DebugResult | null>(null)

  const correr = async (mandar_prueba: boolean) => {
    setPending(true)
    try {
      const res = await fetch('/api/admin/push-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mandar_prueba }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Error en diagnóstico', data.error || 'Inténtalo de nuevo')
        return
      }
      setResultado(data)
      if (mandar_prueba) {
        const okCount = data.suscripciones.filter((s: Suscripcion) => s.resultado?.startsWith('OK')).length
        const failCount = data.suscripciones.length - okCount
        if (okCount > 0 && failCount === 0) {
          toast.success(`${okCount} push enviadas`, 'Si no llega al iPhone, revisa permisos del PWA')
        } else if (okCount === 0) {
          toast.error('Ninguna push se pudo enviar', `${data.eliminadas} borradas por inválidas`)
        } else {
          toast.warning(`${okCount} OK · ${failCount} fallaron`)
        }
      }
    } catch (e) {
      toast.error('Error de red', e instanceof Error ? e.message : 'No se pudo conectar')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => correr(false)}
          disabled={pending}
          className="btn-ghost h-10 text-xs"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Stethoscope className="h-3 w-3" />}
          Solo revisar
        </button>
        <button
          type="button"
          onClick={() => correr(true)}
          disabled={pending}
          className="btn-primary h-10 text-xs"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Probar push
        </button>
      </div>

      {resultado && (
        <div className="space-y-3 pt-1">
          {/* Env vars */}
          <div className="card p-3 space-y-1.5">
            <p className="label-caps">Variables de entorno</p>
            <ul className="text-[11px] space-y-0.5">
              {Object.entries(resultado.env).map(([k, ok]) => (
                <li key={k} className="flex items-center justify-between">
                  <span className="text-zinc-400 font-mono">{k}</span>
                  {ok ? (
                    <span className="text-emerald-400 inline-flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> OK
                    </span>
                  ) : (
                    <span className="text-rose-400 inline-flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Falta
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Resumen */}
          <div className="card p-3 space-y-1">
            <p className="label-caps">Suscripciones registradas</p>
            <p className="text-2xl font-black text-cyan-300 tabular-nums">
              {resultado.total_suscripciones}
            </p>
            {resultado.eliminadas > 0 && (
              <p className="text-[11px] text-amber-400">
                ⚠ {resultado.eliminadas} eliminadas por estar inválidas
              </p>
            )}
            {resultado.total_suscripciones === 0 && (
              <p className="text-[11px] text-rose-400">
                No hay suscripciones. Ve a la sección de arriba y activa &quot;Notificaciones push&quot;.
              </p>
            )}
          </div>

          {/* Detalle por suscripción */}
          {resultado.suscripciones.length > 0 && (
            <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
              {resultado.suscripciones.map((s) => (
                <li key={s.id} className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-white">{s.socio}</p>
                    <span className="chip text-[9px] h-5 px-2">{s.proveedor}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 font-mono break-all">…{s.endpoint_corto}</p>
                  {s.resultado && (
                    <p className={s.resultado.startsWith('OK') ? 'text-[11px] text-emerald-400' : 'text-[11px] text-rose-400'}>
                      {s.resultado}
                    </p>
                  )}
                  {s.accion && (
                    <p className="text-[10px] text-amber-400">→ {s.accion}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <details className="text-[11px] text-zinc-500">
        <summary className="cursor-pointer">Por qué no llega aunque mande &quot;OK&quot;</summary>
        <ul className="mt-2 space-y-1 list-disc list-inside pl-2">
          <li>iOS sólo muestra push si la app está cerrada (no en primer plano)</li>
          <li>La PWA debe estar instalada en pantalla de inicio (iOS Safari only)</li>
          <li>Los permisos de notificaciones deben estar habilitados en Ajustes → Cabo Admin</li>
          <li>Modo bajo consumo / no molestar suprimen pushes silenciosos</li>
          <li>Si reiniciaste el iPhone o reinstalaste la PWA, la suscripción se borra y hay que reactivarla</li>
        </ul>
      </details>
    </div>
  )
}
