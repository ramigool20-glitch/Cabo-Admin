'use client'

import { useActionState, useEffect, useState } from 'react'
import { Loader2, Megaphone, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { hoyEnCabos } from '@/lib/fechas'
import { crearGastoAd, type VentaState } from '@/app/(app)/negocios/actions'
import { toast } from '@/components/ui/toast'

export function GastoAdQuickForm({ negocioId }: { negocioId: string }) {
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<VentaState, FormData>(crearGastoAd, {})
  const [moneda, setMoneda] = useState<'MXN' | 'USD'>('USD')

  useEffect(() => {
    if (state.ok) {
      toast.success('Gasto de ads registrado')
      setOpen(false)
    } else if (state.error) {
      toast.error('No se pudo registrar', state.error)
    }
  }, [state])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card flex items-center gap-3 w-full p-3 hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <span className="h-9 w-9 rounded-lg inline-flex items-center justify-center bg-amber-500/20 border border-amber-500/40">
          <Megaphone className="h-4 w-4 text-amber-300" />
        </span>
        <div className="flex-1 text-left leading-tight">
          <p className="text-sm font-bold text-white">Registrar gasto de ads</p>
          <p className="text-[10px] text-zinc-500">Meta, Google, TikTok... con conversión USD/MXN</p>
        </div>
      </button>
    )
  }

  return (
    <form action={formAction} className="card-glow border-amber-500/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-amber-300 inline-flex items-center gap-1.5">
          <Megaphone className="h-3.5 w-3.5" />
          Nuevo gasto de ads
        </p>
        <button type="button" onClick={() => setOpen(false)} className="h-6 w-6 text-zinc-500 hover:text-white inline-flex items-center justify-center">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <input type="hidden" name="negocio_id" value={negocioId} />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[9px] uppercase tracking-wider text-zinc-500">Fecha</label>
          <input name="fecha" type="date" required defaultValue={hoyEnCabos()} className="input-base w-full h-9 text-xs" />
        </div>
        <div className="space-y-1">
          <label className="text-[9px] uppercase tracking-wider text-zinc-500">Plataforma</label>
          <select name="plataforma" defaultValue="meta" className="input-base w-full h-9 text-xs">
            <option value="meta">Meta (FB/IG)</option>
            <option value="google">Google Ads</option>
            <option value="tiktok">TikTok Ads</option>
            <option value="otro">Otro</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[9px] uppercase tracking-wider text-zinc-500">Monto</label>
        <div className="flex gap-1">
          <input name="monto" type="text" inputMode="decimal" required placeholder="0.00" className="input-base flex-1 h-9 text-xs font-bold tabular-nums" />
          <input type="hidden" name="moneda" value={moneda} />
          <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded-md bg-[var(--bg-input)] border border-[var(--border-subtle)]">
            {(['USD', 'MXN'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMoneda(m)}
                className={cn(
                  'h-8 w-9 rounded text-[10px] font-bold transition-colors',
                  moneda === m ? 'bg-amber-500 text-white' : 'text-zinc-500'
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {state.error && <p className="text-[11px] text-rose-400">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary w-full h-9 text-xs">
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Megaphone className="h-3 w-3" />}
        Guardar gasto
      </button>
    </form>
  )
}
