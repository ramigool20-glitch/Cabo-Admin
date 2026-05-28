'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import Link from 'next/link'
import { formatMoney } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'

type Duplicado = {
  id: string
  tipo: string
  monto: number
  moneda: string
  fecha: string
  concepto: string | null
  cuenta_nombre: string | null
  diasDiff: number
}

export function AvisoDuplicado({
  tipo,
  monto,
  moneda,
  fecha,
  cuenta_id,
  ignorarTxId,
}: {
  tipo: 'ingreso' | 'gasto' | null
  monto: number | null
  moneda: 'MXN' | 'USD' | null
  fecha: string | null
  cuenta_id: string | null
  ignorarTxId?: string | null
}) {
  const [duplicados, setDuplicados] = useState<Duplicado[]>([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!tipo || !monto || !moneda || !fecha || !cuenta_id) {
      setDuplicados([])
      return
    }
    if (monto <= 0) return

    const ac = new AbortController()
    const id = setTimeout(async () => {
      try {
        const res = await fetch('/api/transacciones/check-duplicado', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tipo, monto, moneda, fecha, cuenta_id, ignorarTxId }),
          signal: ac.signal,
        })
        const data = await res.json()
        setDuplicados(data.duplicados ?? [])
        setDismissed(false)
      } catch { /* aborted */ }
    }, 400)

    return () => {
      clearTimeout(id)
      ac.abort()
    }
  }, [tipo, monto, moneda, fecha, cuenta_id, ignorarTxId])

  if (dismissed || duplicados.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-amber-300 inline-flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          Posible duplicado{duplicados.length > 1 ? 's' : ''} ({duplicados.length})
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-amber-300/70 hover:text-amber-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-[11px] text-amber-200/80">
        Encontré transacciones parecidas en los últimos días. Revisa antes de guardar:
      </p>
      <ul className="space-y-1">
        {duplicados.map((d) => (
          <li key={d.id}>
            <Link
              href={`/transacciones/${d.id}`}
              target="_blank"
              className="block rounded-md bg-black/30 border border-amber-500/30 p-2 hover:bg-black/50 text-[11px]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-white font-bold truncate">
                  {d.concepto || 'Sin concepto'}
                </span>
                <span className="text-amber-300 font-bold tabular-nums">
                  {formatMoney(d.monto, d.moneda as 'MXN' | 'USD')}
                </span>
              </div>
              <p className="text-amber-200/60 mt-0.5">
                {formatearFecha(d.fecha, 'dd MMM')}
                {d.diasDiff !== 0 && (
                  <span> ({d.diasDiff > 0 ? '+' : ''}{d.diasDiff}d)</span>
                )}
                {d.cuenta_nombre && ` · ${d.cuenta_nombre}`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-amber-300/60 italic">
        Si NO es duplicado, puedes guardar normalmente.
      </p>
    </div>
  )
}
