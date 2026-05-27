'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function RadarError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Radar error:', error)
  }, [error])

  return (
    <div className="px-4 pt-5 pb-24 space-y-4 max-w-3xl mx-auto">
      <header className="space-y-2">
        <h1 className="text-2xl font-black heading-gradient inline-flex items-center gap-2">
          🛰️ Radar
        </h1>
      </header>
      <div className="card-glow border-rose-500/40 bg-rose-500/5 p-5 space-y-3">
        <div className="flex items-center gap-2 text-rose-300">
          <AlertTriangle className="h-5 w-5" />
          <p className="font-bold">Algo falló al cargar Radar</p>
        </div>
        <p className="text-xs text-rose-200/80 font-mono break-all">
          {error.message || 'Error desconocido'}
        </p>
        {error.digest && (
          <p className="text-[10px] text-zinc-500">ID: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="btn-primary w-full h-10 text-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </button>
        <p className="text-[10px] text-zinc-500">
          Si persiste, copia el error y mándalo para que se arregle.
        </p>
      </div>
    </div>
  )
}
