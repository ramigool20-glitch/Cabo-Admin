'use client'

import { useState, useTransition } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { refrescarRadar } from '@/app/(app)/radar/actions'
import { toast } from '@/components/ui/toast'
import { useRouter } from 'next/navigation'

export function RadarRefreshButton() {
  const [pending, setPending] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()

  const refrescar = () => {
    setPending(true)
    startTransition(async () => {
      const res = await refrescarRadar()
      if (res.ok) {
        toast.success(`Radar actualizado`, `${res.count ?? 0} insights nuevos`)
        router.refresh()
      } else {
        toast.error('Falló el radar', res.error)
      }
      setPending(false)
    })
  }

  return (
    <button
      type="button"
      onClick={refrescar}
      disabled={pending}
      className="btn-primary w-full h-11 text-sm"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {pending ? 'Buscando noticias…' : 'Refrescar ahora'}
    </button>
  )
}
