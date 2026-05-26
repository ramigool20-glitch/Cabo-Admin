'use client'

import { useEffect, useState, useTransition } from 'react'
import { Bell, BellOff, Send, AlertCircle, Loader2, Check, Smartphone, RefreshCw } from 'lucide-react'
import { activarPush, desactivarPush, estadoPush, pushSoportado, type EstadoPush } from '@/lib/push/client'
import { toast } from '@/components/ui/toast'

function isIOSStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari PWA: navigator.standalone === true
  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
}

export function PushSection() {
  const [estado, setEstado] = useState<EstadoPush | 'cargando'>('cargando')
  const [standalone, setStandalone] = useState(false)
  const [esIOS, setEsIOS] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    setStandalone(isIOSStandalone())
    setEsIOS(isIOSDevice())
    if (!pushSoportado()) {
      setEstado('no_soportado')
      return
    }
    estadoPush().then(setEstado)
  }, [])

  const refrescar = async () => {
    setEstado(await estadoPush())
  }

  const handleActivar = () => {
    startTransition(async () => {
      const res = await activarPush()
      if (res.ok) {
        toast.success('🔔 Push activadas', 'Te llegarán recordatorios y alertas')
        await refrescar()
      } else {
        toast.error('No se pudo activar', res.error || 'Inténtalo de nuevo')
      }
    })
  }

  const handleReactivar = () => {
    startTransition(async () => {
      // Forzar limpieza completa y volver a registrar
      await desactivarPush()
      const res = await activarPush()
      if (res.ok) {
        toast.success('Re-activado', 'Suscripción nueva creada')
        await refrescar()
      } else {
        toast.error('Falló el re-registro', res.error || 'Inténtalo de nuevo')
      }
    })
  }

  const handleDesactivar = () => {
    startTransition(async () => {
      await desactivarPush()
      toast.info('Notificaciones desactivadas en este dispositivo')
      await refrescar()
    })
  }

  const handleProbar = () => {
    startTransition(async () => {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const data = await res.json()
      if (data.enviados > 0) {
        toast.success(`Push enviado a ${data.enviados} dispositivo${data.enviados > 1 ? 's' : ''}`, 'Si no ves nada, bloquea la pantalla y espera 5s')
      } else {
        toast.error('No se pudo enviar', 'Toca "Re-activar" abajo')
      }
    })
  }

  if (estado === 'cargando') {
    return (
      <div className="card p-4 text-sm text-zinc-500">
        Cargando estado de notificaciones…
      </div>
    )
  }

  // CASO 1: iOS sin instalar como PWA
  if (esIOS && !standalone) {
    return (
      <div className="card-glow border-amber-500/40 p-4 space-y-3">
        <div className="inline-flex items-center gap-2 text-amber-300">
          <Smartphone className="h-5 w-5" />
          <span className="text-sm font-bold">Instala la app primero</span>
        </div>
        <p className="text-xs text-zinc-400">
          En iPhone, las push <strong>solo funcionan</strong> si la app está instalada en pantalla de inicio.
        </p>
        <ol className="text-xs text-zinc-300 space-y-1.5 list-decimal list-inside pl-1">
          <li>Toca el botón <strong>Compartir</strong> ⬆️ abajo en Safari</li>
          <li>Desliza y toca <strong>&quot;Añadir a pantalla de inicio&quot;</strong></li>
          <li>Confirma con <strong>&quot;Añadir&quot;</strong></li>
          <li>Cierra Safari y <strong>abre la app desde el ícono</strong></li>
          <li>Vuelve aquí a activar las notificaciones</li>
        </ol>
      </div>
    )
  }

  if (estado === 'no_soportado') {
    return (
      <div className="card p-4 space-y-2">
        <div className="inline-flex items-center gap-2 text-amber-300 text-sm font-medium">
          <AlertCircle className="h-4 w-4" />
          Push no disponible
        </div>
        <p className="text-xs text-zinc-500">
          Tu navegador no soporta notificaciones push. Usa Safari (iOS 16.4+) o Chrome.
        </p>
      </div>
    )
  }

  if (estado === 'denegado') {
    return (
      <div className="card-glow border-rose-500/40 p-4 space-y-3">
        <div className="inline-flex items-center gap-2 text-rose-300 text-sm font-bold">
          <BellOff className="h-4 w-4" />
          Notificaciones bloqueadas en este dispositivo
        </div>
        <p className="text-xs text-zinc-400">
          Para reactivarlas en iOS:
        </p>
        <ol className="text-xs text-zinc-300 space-y-1 list-decimal list-inside pl-1">
          <li>Abre <strong>Ajustes</strong> del iPhone</li>
          <li>Busca y abre <strong>Cabo Admin</strong> en la lista</li>
          <li>Toca <strong>Notificaciones</strong> → activa &quot;Permitir notificaciones&quot;</li>
          <li>Regresa aquí y toca &quot;Activar&quot;</li>
        </ol>
      </div>
    )
  }

  const activo = estado === 'activo'

  return (
    <div className="card-glow p-4 space-y-3">
      <div className="flex items-center gap-3">
        {activo ? (
          <>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
              <Bell className="h-5 w-5" />
            </span>
            <div className="flex-1 leading-tight">
              <p className="text-sm font-bold text-emerald-300">Notificaciones activas</p>
              <p className="text-[11px] text-zinc-400">En este dispositivo</p>
            </div>
          </>
        ) : (
          <>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-500/20 border border-zinc-500/40 text-zinc-400">
              <BellOff className="h-5 w-5" />
            </span>
            <div className="flex-1 leading-tight">
              <p className="text-sm font-bold text-white">Sin activar</p>
              <p className="text-[11px] text-zinc-400">Aquí no recibirás push</p>
            </div>
          </>
        )}
      </div>

      <p className="text-[11px] text-zinc-500">
        Te avisaremos cada mañana, recordatorios de tareas, gastos vencidos y eventos.
      </p>

      {activo ? (
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={handleProbar}
            disabled={pending}
            className="h-10 rounded-lg border border-emerald-500/30 text-emerald-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Probar
          </button>
          <button
            type="button"
            onClick={handleReactivar}
            disabled={pending}
            className="h-10 rounded-lg border border-cyan-500/30 text-cyan-300 text-xs font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Re-activar
          </button>
          <button
            type="button"
            onClick={handleDesactivar}
            disabled={pending}
            className="h-10 rounded-lg border border-rose-500/30 text-rose-300 text-xs font-medium disabled:opacity-50"
          >
            Apagar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleActivar}
          disabled={pending}
          className="btn-primary w-full h-12 text-sm"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
          {pending ? 'Activando…' : 'Activar notificaciones push'}
        </button>
      )}
    </div>
  )
}
