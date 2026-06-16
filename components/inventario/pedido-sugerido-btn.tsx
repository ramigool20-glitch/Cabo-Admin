'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { PedidoSugeridoSheet } from '@/components/inventario/pedido-sugerido-sheet'

export function PedidoSugeridoBtn() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 px-3 rounded-full bg-gradient-to-r from-cyan-600 to-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-lg shadow-cyan-500/30 active:scale-95 transition-transform"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden xs:inline">Pedido IA</span>
        <span className="xs:hidden">IA</span>
      </button>
      <PedidoSugeridoSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
