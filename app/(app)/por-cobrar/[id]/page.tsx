import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Trash2, Building, Phone, Mail, FileText, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha, hoyEnCabos } from '@/lib/fechas'
import { RegistrarCobroForm } from '@/components/por-cobrar/registrar-cobro-form'
import { cancelarCuentaCobrar } from '@/app/(app)/por-cobrar/actions'
import { EliminarCuentaCobrarBtn } from '@/components/por-cobrar/eliminar-btn'

const ESTADO_CHIP = {
  pendiente: { l: 'Pendiente', c: 'chip-yellow' },
  parcial:   { l: 'Parcial',   c: 'chip-cyan' },
  cobrado:   { l: '✓ Cobrado', c: 'chip-green' },
  vencido:   { l: 'Vencido',   c: 'chip-red' },
  cancelado: { l: 'Cancelado', c: '' },
}

export default async function DetalleCuentaPorCobrarPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params
  const supabase = await createClient()

  const [{ data: cuenta }, { data: cobros }, { data: cuentas }] = await Promise.all([
    supabase.from('cuentas_por_cobrar').select('*, negocios(nombre)').eq('id', id).single(),
    supabase.from('cuentas_por_cobrar_cobros').select('*, cuentas(nombre)').eq('cuenta_id', id).order('fecha_cobro', { ascending: false }),
    supabase.from('cuentas').select('id, nombre, moneda').eq('activo', true).order('nombre'),
  ])

  if (!cuenta) notFound()

  const negocio = cuenta.negocios as unknown as { nombre: string } | null
  const restante = Number(cuenta.monto_total) - Number(cuenta.monto_cobrado)
  const hoy = hoyEnCabos()
  const vencido = cuenta.estado !== 'cobrado' && cuenta.fecha_vencimiento && cuenta.fecha_vencimiento < hoy
  const estado = vencido ? ESTADO_CHIP.vencido : ESTADO_CHIP[cuenta.estado as keyof typeof ESTADO_CHIP]

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <Link href="/por-cobrar" className="inline-flex items-center gap-1 text-sm text-zinc-400">
          <ChevronLeft className="h-4 w-4" /> Por Cobrar
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/por-cobrar/${id}/editar`}
            className="h-10 px-3 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1.5 border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Link>
          <EliminarCuentaCobrarBtn id={id} cliente={cuenta.cliente_nombre} />
        </div>
      </div>

      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-white">{cuenta.cliente_nombre}</h1>
            <p className="text-sm text-zinc-400 mt-1">{cuenta.concepto}</p>
          </div>
          <span className={cn('chip', estado.c)}>{estado.l}</span>
        </div>
      </header>

      <div className="card-glow p-5 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="label-caps">Restante</span>
          <p className={cn('text-3xl font-black tabular-nums', restante > 0 ? 'text-emerald-300' : 'text-zinc-400')}>
            {formatMoney(restante, cuenta.moneda as 'MXN' | 'USD')}
          </p>
        </div>
        {Number(cuenta.monto_cobrado) > 0 && (
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-zinc-500">Cobrado</span>
            <span className="text-emerald-400 tabular-nums">{formatMoney(Number(cuenta.monto_cobrado), cuenta.moneda as 'MXN' | 'USD')}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-zinc-500">Total</span>
          <span className="text-white tabular-nums">{formatMoney(Number(cuenta.monto_total), cuenta.moneda as 'MXN' | 'USD')}</span>
        </div>

        {Number(cuenta.monto_total) > 0 && (
          <div className="pt-2">
            <div className="h-2 rounded-full bg-[var(--bg-input)] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500"
                style={{ width: `${Math.min(100, (Number(cuenta.monto_cobrado) / Number(cuenta.monto_total)) * 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-zinc-500 mt-1 text-right">
              {Math.round((Number(cuenta.monto_cobrado) / Number(cuenta.monto_total)) * 100)}% cobrado
            </p>
          </div>
        )}
      </div>

      <div className="card p-4 space-y-2 text-sm">
        {cuenta.fecha_vencimiento && (
          <div className="flex justify-between">
            <span className="text-zinc-500">Vencimiento</span>
            <span className={cn('font-medium', vencido ? 'text-rose-400' : 'text-white')}>
              {formatearFecha(cuenta.fecha_vencimiento, 'EEEE dd MMM yyyy')}
            </span>
          </div>
        )}
        {cuenta.categoria && (
          <div className="flex justify-between">
            <span className="text-zinc-500">Categoría</span>
            <span className="text-white capitalize">{cuenta.categoria}</span>
          </div>
        )}
        {cuenta.referencia && (
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Referencia</span>
            <span className="text-white text-right break-all">{cuenta.referencia}</span>
          </div>
        )}
        {negocio && (
          <div className="flex justify-between">
            <span className="text-zinc-500 inline-flex items-center gap-1"><Building className="h-3 w-3" /> Negocio</span>
            <span className="text-white">{negocio.nombre}</span>
          </div>
        )}
        {cuenta.cliente_telefono && (
          <div className="flex justify-between">
            <span className="text-zinc-500 inline-flex items-center gap-1"><Phone className="h-3 w-3" /> Teléfono</span>
            <a href={`tel:${cuenta.cliente_telefono}`} className="text-cyan-400">{cuenta.cliente_telefono}</a>
          </div>
        )}
        {cuenta.cliente_email && (
          <div className="flex justify-between">
            <span className="text-zinc-500 inline-flex items-center gap-1"><Mail className="h-3 w-3" /> Email</span>
            <a href={`mailto:${cuenta.cliente_email}`} className="text-cyan-400">{cuenta.cliente_email}</a>
          </div>
        )}
      </div>

      {cuenta.estado !== 'cobrado' && cuenta.estado !== 'cancelado' && (
        <section className="card-glow p-4 space-y-3">
          <p className="label-caps">Registrar cobro</p>
          <RegistrarCobroForm
            cuentaId={id}
            restante={restante}
            moneda={cuenta.moneda as 'MXN' | 'USD'}
            cuentas={cuentas ?? []}
          />
        </section>
      )}

      {cobros && cobros.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps">Cobros ({cobros.length})</h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {cobros.map((p) => {
              const cta = p.cuentas as unknown as { nombre: string } | null
              return (
                <li key={p.id} className="p-3 flex items-center justify-between">
                  <div className="leading-tight">
                    <p className="text-sm font-medium text-white">{formatearFecha(p.fecha_cobro, 'dd MMM yyyy')}</p>
                    <p className="text-xs text-zinc-500">
                      {p.metodo_pago ?? '—'}{cta ? ` · ${cta.nombre}` : ''}
                    </p>
                  </div>
                  <p className="text-sm font-bold tabular-nums text-emerald-400">
                    {formatMoney(Number(p.monto), cuenta.moneda as 'MXN' | 'USD')}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {cuenta.estado !== 'cancelado' && cuenta.estado !== 'cobrado' && (
        <form action={cancelarCuentaCobrar.bind(null, id)}>
          <button
            type="submit"
            className="w-full h-11 rounded-xl border border-rose-500/30 text-rose-400 text-sm font-medium inline-flex items-center justify-center gap-2"
          >
            <Trash2 className="h-4 w-4" /> Cancelar esta cuenta
          </button>
        </form>
      )}
    </div>
  )
}
