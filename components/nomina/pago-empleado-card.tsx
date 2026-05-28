'use client'

import { useState, useTransition } from 'react'
import { Loader2, DollarSign, Plus, Check } from 'lucide-react'
import { formatMoney } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { pagarNomina, agregarExtra } from '@/app/(app)/nomina/pagos-actions'

type Cuenta = { id: string; nombre: string }
type Negocio = { id: string; nombre: string }

export type PagoEmpleado = {
  empleadoId: string
  nombre: string
  puesto: string | null
  periodoInicio: string
  periodoFin: string
  periodoLabel: string
  sueldo: number
  comisiones: number
  propinas: number
  bono: number
  extras: number
  total: number
  yaPagado: boolean
  negocioId: string | null
  detalleComision?: string
}

export function PagoEmpleadoCard({
  pago, cuentas, negocios,
}: {
  pago: PagoEmpleado
  cuentas: Cuenta[]
  negocios: Negocio[]
}) {
  const [pending, start] = useTransition()
  const [showExtra, setShowExtra] = useState(false)
  const [cuentaId, setCuentaId] = useState('')

  function pagar() {
    if (!confirm(`¿Pagar ${formatMoney(pago.total, 'MXN')} a ${pago.nombre}? Genera el gasto.`)) return
    const fd = new FormData()
    fd.set('empleado_id', pago.empleadoId)
    fd.set('empleado_nombre', pago.nombre)
    fd.set('periodo_inicio', pago.periodoInicio)
    fd.set('periodo_fin', pago.periodoFin)
    fd.set('sueldo', String(pago.sueldo))
    fd.set('comisiones', String(pago.comisiones))
    fd.set('propinas', String(pago.propinas))
    fd.set('bono', String(pago.bono))
    fd.set('extras', String(pago.extras))
    fd.set('cuenta_id', cuentaId)
    if (pago.negocioId) fd.set('negocio_id', pago.negocioId)
    start(async () => {
      const r = await pagarNomina(fd)
      if (r.ok) toast.success('Pagado', `${pago.nombre}: ${formatMoney(pago.total, 'MXN')}`)
      else toast.error('Error', r.error)
    })
  }

  function addExtra(formData: FormData) {
    formData.set('empleado_id', pago.empleadoId)
    start(async () => {
      const r = await agregarExtra(formData)
      if (r.ok) { toast.success('Extra agregado'); setShowExtra(false) }
      else toast.error('Error', r.error)
    })
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-bold text-white">{pago.nombre}</p>
          <p className="text-[11px] text-zinc-500">{pago.puesto} · {pago.periodoLabel}</p>
        </div>
        {pago.yaPagado ? (
          <span className="chip chip-green text-[10px]"><Check className="h-3 w-3" /> Pagado</span>
        ) : (
          <span className="text-xl font-black tabular-nums text-emerald-300">{formatMoney(pago.total, 'MXN')}</span>
        )}
      </div>

      {/* Desglose */}
      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
        <Item label="Sueldo base" monto={pago.sueldo} />
        {pago.comisiones > 0 && <Item label="Comisiones" monto={pago.comisiones} sub={pago.detalleComision} color="text-cyan-400" />}
        {pago.propinas > 0 && <Item label="Propinas" monto={pago.propinas} color="text-emerald-400" />}
        {pago.bono > 0 && <Item label="Bono reviews" monto={pago.bono} color="text-amber-400" />}
        {pago.extras > 0 && <Item label="Extras" monto={pago.extras} color="text-purple-400" />}
      </div>

      {!pago.yaPagado && (
        <>
          <div className="flex gap-2">
            <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="input-base flex-1 h-9 text-xs">
              <option value="">— Cuenta de pago —</option>
              {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <button type="button" onClick={() => setShowExtra((v) => !v)} className="h-9 px-3 rounded-md border border-purple-500/40 text-purple-300 text-xs font-bold inline-flex items-center gap-1">
              <Plus className="h-3 w-3" /> Extra
            </button>
          </div>

          {showExtra && (
            <form action={addExtra} className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-2 space-y-2">
              <input name="concepto" placeholder="Concepto (ej: dinero comida)" required className="input-base w-full h-8 text-xs" />
              <div className="flex gap-2">
                <input name="monto" type="text" inputMode="decimal" required placeholder="200" className="input-base flex-1 h-8 text-xs tabular-nums" />
                <button type="submit" disabled={pending} className="btn-primary h-8 px-3 text-xs">
                  {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Agregar'}
                </button>
              </div>
            </form>
          )}

          <button type="button" onClick={pagar} disabled={pending} className="btn-primary w-full h-10 text-sm">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
            Pagar {formatMoney(pago.total, 'MXN')}
          </button>
        </>
      )}
    </div>
  )
}

function Item({ label, monto, sub, color }: { label: string; monto: number; sub?: string; color?: string }) {
  return (
    <div className="rounded bg-black/30 p-1.5">
      <p className="text-[9px] text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xs font-bold tabular-nums ${color ?? 'text-white'}`}>{formatMoney(monto, 'MXN')}</p>
      {sub && <p className="text-[9px] text-zinc-600">{sub}</p>}
    </div>
  )
}
