'use client'

import { useTransition } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { eliminarCuentaPorPagar } from '@/app/(app)/por-pagar/actions'
import { toast } from '@/components/ui/toast'

export function EliminarCuentaPagarBtn({ id, proveedor }: { id: string; proveedor: string }) {
  const [pending, start] = useTransition()

  function onClick() {
    if (!confirm(`¿Eliminar deuda con "${proveedor}"? También se borran los pagos registrados.`)) return
    start(async () => {
      await eliminarCuentaPorPagar(id)
      toast.success('Eliminado')
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="h-10 px-3 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1.5 border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      Eliminar
    </button>
  )
}
