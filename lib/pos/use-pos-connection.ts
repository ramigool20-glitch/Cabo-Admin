'use client'

/**
 * Hook que combina:
 *   1. Estado de conexión (online/offline)
 *   2. Tamaño de la cola de ventas pendientes
 *   3. Función para sincronizar manualmente
 *   4. Auto-sync cuando regresa la conexión
 */

import { useEffect, useState, useCallback } from 'react'
import { getColaSize, procesarCola, type VentaInput } from '@/lib/pos/offline-queue'

export function usePosConnection(
  procesar: (input: VentaInput) => Promise<{ error?: string; id?: string; ok?: boolean }>,
  onSyncResult?: (r: { exitosas: number; fallidas: number }) => void,
) {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [colaSize, setColaSize] = useState<number>(0)
  const [sincronizando, setSincronizando] = useState(false)

  // Lee la cola al montar
  useEffect(() => {
    setColaSize(getColaSize())
  }, [])

  // Escucha cambios de conexión
  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const sync = useCallback(async () => {
    if (sincronizando) return
    if (!navigator.onLine) return
    if (getColaSize() === 0) return
    setSincronizando(true)
    try {
      const r = await procesarCola(procesar)
      setColaSize(getColaSize())
      onSyncResult?.({ exitosas: r.exitosas, fallidas: r.fallidas })
    } finally {
      setSincronizando(false)
    }
  }, [sincronizando, procesar, onSyncResult])

  // Auto-sync cuando regresa la conexión
  useEffect(() => {
    if (online) sync()
  }, [online, sync])

  // Función para refrescar el contador después de agregar a cola
  const refrescarCola = useCallback(() => {
    setColaSize(getColaSize())
  }, [])

  return { online, colaSize, sincronizando, sync, refrescarCola }
}
