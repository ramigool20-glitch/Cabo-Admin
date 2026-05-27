'use client'

import { useTransition } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { eliminarVenta, eliminarGastoAd } from '@/app/(app)/negocios/actions'
import { toast } from '@/components/ui/toast'

type Props = {
  id: string
  negocioId: string
  tipo: 'venta' | 'ad'
  etiqueta?: string
}

export function EliminarItemBtn({ id, negocioId, tipo, etiqueta }: Props) {
  const [pending, start] = useTransition()

  function onClick() {
    if (!confirm(`¿Eliminar ${tipo === 'venta' ? 'esta venta' : 'este gasto de ads'}${etiqueta ? ` (${etiqueta})` : ''}?`)) return
    start(async () => {
      const res = tipo === 'venta'
        ? await eliminarVenta(id, negocioId)
        : await eliminarGastoAd(id, negocioId)
      if (res.ok) {
        toast.success(tipo === 'venta' ? 'Venta eliminada' : 'Gasto eliminado')
      } else {
        toast.error('No se pudo eliminar')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="h-8 w-8 rounded-md inline-flex items-center justify-center text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
      aria-label="Eliminar"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  )
}
