'use client'

import { useState, useTransition } from 'react'
import { Loader2, Scale } from 'lucide-react'
import { toast } from '@/components/ui/toast'
import { liquidarSaldoRoomates } from '@/app/(app)/casa/actions'

type Socio = { id: string; nombre: string }
type Cuenta = { id: string; nombre: string; moneda: string }

export function LiquidarRoomatesForm({
  socios,
  cuentas,
  sugeridoMonto,
  sugeridoPagador,
  sugeridoReceptor,
}: {
  socios: Socio[]
  cuentas: Cuenta[]
  sugeridoMonto?: number
  sugeridoPagador?: string
  sugeridoReceptor?: string
}) {
  const [open, setOpen] = useState(false)
  const [pagadorId, setPagadorId] = useState(sugeridoPagador ?? socios[0]?.id ?? '')
  const [receptorId, setReceptorId] = useState(sugeridoReceptor ?? socios[1]?.id ?? '')
  const [monto, setMonto] = useState(sugeridoMonto ? sugeridoMonto.toFixed(2) : '')
  const [cuentaId, setCuentaId] = useState('')
  const [pending, startTransition] = useTransition()

  const liquidar = () => {
    const n = Number(monto.replace(',', '.'))
    if (!pagadorId || !receptorId || pagadorId === receptorId) {
      toast.error('Pagador y receptor deben ser distintos')
      return
    }
    if (!n || n <= 0) {
      toast.error('Monto inválido')
      return
    }
    startTransition(async () => {
      const res = await liquidarSaldoRoomates(pagadorId, receptorId, n, cuentaId || null)
      if (res.ok) {
        toast.success('Saldo liquidado', `Se registró la transferencia entre roomates`)
        setOpen(false)
      } else {
        toast.error('No se pudo liquidar', res.error)
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-10 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-300 text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-amber-500/20 transition-colors"
      >
        <Scale className="h-3.5 w-3.5" />
        Liquidar saldo entre roomates
      </button>
    )
  }

  return (
    <div className="space-y-2 pt-1">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Pagador</label>
          <select
            value={pagadorId}
            onChange={(e) => setPagadorId(e.target.value)}
            className="input-base w-full h-9 text-xs"
          >
            {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Receptor</label>
          <select
            value={receptorId}
            onChange={(e) => setReceptorId(e.target.value)}
            className="input-base w-full h-9 text-xs"
          >
            {socios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Monto MXN</label>
          <input
            type="text"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            className="input-base w-full h-9 text-xs font-bold tabular-nums"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500">Cuenta</label>
          <select
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            className="input-base w-full h-9 text-xs"
          >
            <option value="">— Sin cuenta</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 h-9 rounded-lg border border-[var(--border-subtle)] text-xs text-zinc-400"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={liquidar}
          disabled={pending}
          className="flex-[2] h-9 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Scale className="h-3 w-3" />}
          Confirmar liquidación
        </button>
      </div>
    </div>
  )
}
