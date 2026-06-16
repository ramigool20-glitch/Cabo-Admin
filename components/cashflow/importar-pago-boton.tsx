'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Download } from 'lucide-react'

export function ImportarPagoBoton({ integId, paymentId }: { integId: string; paymentId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [ok, setOk] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const importar = async () => {
    setPending(true)
    setErr(null)
    try {
      const res = await fetch('/api/integraciones/mp/importar-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integ_id: integId, payment_id: paymentId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      setOk(true)
      setTimeout(() => router.refresh(), 700)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setPending(false)
    }
  }

  if (ok) {
    return (
      <span className="h-9 w-9 rounded-md bg-emerald-500/20 text-emerald-300 inline-flex items-center justify-center" title="Importado">
        <Check className="h-4 w-4" />
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={importar}
      disabled={pending}
      className="h-9 px-3 rounded-md border border-amber-500/40 text-amber-200 text-xs font-bold inline-flex items-center gap-1 hover:bg-amber-500/10 disabled:opacity-50"
      title={err ?? 'Importar este pago a la app'}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      Importar
    </button>
  )
}
