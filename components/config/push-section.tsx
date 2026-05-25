'use client'

import { useEffect, useState, useTransition } from 'react'
import { Bell, BellOff, Send, AlertCircle, Loader2, Check } from 'lucide-react'
import { activarPush, desactivarPush, estadoPush, pushSoportado, type EstadoPush } from '@/lib/push/client'
import { cn } from '@/lib/utils'

export function PushSection() {
  const [estado, setEstado] = useState<EstadoPush | 'cargando'>('cargando')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [tipoMsg, setTipoMsg] = useState<'ok' | 'error' | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!pushSoportado()) {
      setEstado('no_soportado')
      return
    }
    estadoPush().then(setEstado)
  }, [])

  const handleActivar = () => {
    setMensaje(null)
    startTransition(async () => {
      const res = await activarPush()
      if (res.ok) {
        setEstado('activo')
        setMensaje('¡Activado! Te llegarán recordatorios de nómina y rentas.')
        setTipoMsg('ok')
      } else {
        setMensaje(res.error || 'Error desconocido')
        setTipoMsg('error')
      }
    })
  }

  const handleDesactivar = () => {
    startTransition(async () => {
      await desactivarPush()
      setEstado('no_registrado')
      setMensaje('Desactivado en este dispositivo.')
      setTipoMsg('ok')
    })
  }

  const handleProbar = () => {
    setMensaje(null)
    startTransition(async () => {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const data = await res.json()
      if (data.enviados > 0) {
        setMensaje(`Push enviado a ${data.enviados} dispositivo(s). Debe llegar en segundos.`)
        setTipoMsg('ok')
      } else {
        setMensaje('No se pudo enviar. Asegúrate de que esté activado en este dispositivo.')
        setTipoMsg('error')
      }
    })
  }

  if (estado === 'cargando') {
    return (
      <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 text-sm text-zinc-500">
        Cargando estado de notificaciones…
      </div>
    )
  }

  if (estado === 'no_soportado') {
    return (
      <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 space-y-2">
        <div className="inline-flex items-center gap-2 text-amber-600 text-sm font-medium">
          <AlertCircle className="h-4 w-4" />
          Push no disponible
        </div>
        <p className="text-xs text-zinc-500">
          Para recibir notificaciones en iPhone tienes que <strong>agregar la app a tu pantalla de inicio</strong> primero (botón Compartir → "Agregar a pantalla de inicio") y abrir la app desde el ícono.
        </p>
      </div>
    )
  }

  if (estado === 'denegado') {
    return (
      <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 space-y-2">
        <div className="inline-flex items-center gap-2 text-red-600 text-sm font-medium">
          <BellOff className="h-4 w-4" />
          Notificaciones bloqueadas
        </div>
        <p className="text-xs text-zinc-500">
          Bloqueaste las notificaciones. Para activarlas, ve a Configuración del teléfono → Cabo Admin → activa Notificaciones.
        </p>
      </div>
    )
  }

  const activo = estado === 'activo'

  return (
    <div className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-sm font-medium">
          {activo ? (
            <>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
                <Bell className="h-4 w-4" />
              </span>
              <span>Notificaciones activadas</span>
            </>
          ) : (
            <>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600">
                <BellOff className="h-4 w-4" />
              </span>
              <span>Sin activar</span>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        Te avisaremos 1 día antes de cada pago de nómina y 2 días antes de cada renta.
      </p>

      {mensaje && (
        <p
          className={cn(
            'text-xs flex items-start gap-1',
            tipoMsg === 'ok' ? 'text-emerald-600' : 'text-red-600'
          )}
        >
          {tipoMsg === 'ok' ? <Check className="h-3.5 w-3.5 mt-0.5" /> : <AlertCircle className="h-3.5 w-3.5 mt-0.5" />}
          <span>{mensaje}</span>
        </p>
      )}

      <div className="flex gap-2 pt-1">
        {activo ? (
          <>
            <button
              type="button"
              onClick={handleProbar}
              disabled={pending}
              className="flex-1 h-10 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar prueba
            </button>
            <button
              type="button"
              onClick={handleDesactivar}
              disabled={pending}
              className="h-10 px-4 rounded-lg border border-red-200 dark:border-red-900 text-red-600 text-sm font-medium disabled:opacity-50"
            >
              Desactivar
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleActivar}
            disabled={pending}
            className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Activar notificaciones
          </button>
        )}
      </div>
    </div>
  )
}
