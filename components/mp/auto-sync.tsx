'use client'

/**
 * Auto-sync silencioso: cuando el usuario abre la app, si han pasado
 * más de 2 minutos desde la última sincronización, dispara POST a
 * /api/integraciones/mp/sync-all en background. Sin UI ni toasts.
 *
 * Se monta en el layout del segmento (app) que ya requiere autenticación.
 */
import { useEffect } from 'react'

const LS_KEY = 'mp-last-auto-sync'
const MIN_INTERVAL_MS = 2 * 60 * 1000 // 2 minutos

export function MpAutoSync() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const last = Number(localStorage.getItem(LS_KEY) ?? '0')
    if (Date.now() - last < MIN_INTERVAL_MS) return

    // Marcamos ya el timestamp para evitar disparos múltiples si el componente
    // se monta varias veces (por hot-reload, navegación SPA, etc.)
    localStorage.setItem(LS_KEY, String(Date.now()))

    // Fire-and-forget. Si falla, no molestamos al usuario.
    fetch('/api/integraciones/mp/sync-all', { method: 'POST' })
      .catch(() => {})
  }, [])

  return null
}
