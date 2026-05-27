import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Plus, PartyPopper, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha, hoyEnCabos } from '@/lib/fechas'
import { PagoEventoForm } from '@/components/eventos/pago-evento-form'
import { realizarEvento, pagarProveedor, eliminarEvento } from '@/app/(app)/eventos/actions'
import { EliminarEventoBtn } from '@/components/eventos/eliminar-evento-btn'

const ESTADO_CHIP = {
  reservado:        { l: 'Reservado',     c: 'chip-yellow' },
  confirmado:       { l: 'Confirmado',    c: 'chip-cyan' },
  realizado:        { l: 'Realizado',     c: 'chip-green' },
  pagado_proveedor: { l: '✓ Cerrado',     c: 'chip-green' },
  cancelado:        { l: 'Cancelado',     c: '' },
}

export default async function DetalleEventoPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params
  const supabase = await createClient()

  const [{ data: evento }, { data: pagos }, { data: cuentas }] = await Promise.all([
    supabase.from('eventos').select('*, negocios(nombre)').eq('id', id).single(),
    supabase.from('eventos_pagos').select('*').eq('evento_id', id).order('fecha_pago', { ascending: false }),
    supabase.from('cuentas').select('id, nombre, moneda').eq('activo', true).order('nombre'),
  ])

  if (!evento) notFound()

  const negocio = evento.negocios as unknown as { nombre: string } | null
  const estado = ESTADO_CHIP[evento.estado as keyof typeof ESTADO_CHIP]
  const totalPagado = (pagos ?? []).reduce((s, p) => s + Number(p.monto), 0)
  const pendiente = Number(evento.monto_total) - totalPagado
  const comision = Number(evento.monto_total) * (Number(evento.comision_porcentaje) / 100)
  const proveedor = Number(evento.monto_total) - comision
  const hoy = hoyEnCabos()

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <Link href="/eventos" className="inline-flex items-center gap-1 text-sm text-zinc-400">
          <ChevronLeft className="h-4 w-4" /> Eventos
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/eventos/${id}/editar`}
            className="h-10 px-3 rounded-md text-xs font-bold inline-flex items-center justify-center gap-1.5 border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Link>
          <EliminarEventoBtn id={id} cliente={evento.cliente_nombre} />
        </div>
      </div>

      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🎉</span>
              <h1 className="text-2xl font-black text-white truncate">{evento.cliente_nombre}</h1>
            </div>
            <p className="text-sm text-zinc-400">
              {evento.tipo_evento && `${evento.tipo_evento} · `}
              {formatearFecha(evento.fecha_evento, 'EEEE dd MMMM yyyy')}
              {evento.hora_evento && ` · ${evento.hora_evento}`}
            </p>
          </div>
          <span className={cn('chip', estado.c)}>{estado.l}</span>
        </div>
        {/* Chips de detalles */}
        <div className="flex flex-wrap gap-1.5">
          {evento.paquete && (
            <span className="chip chip-purple text-[10px]">📦 {evento.paquete}</span>
          )}
          {evento.num_personas != null && (
            <span className="chip text-[10px]">👥 {evento.num_personas} personas</span>
          )}
          {evento.duracion_horas != null && (
            <span className="chip text-[10px]">⏱ {evento.duracion_horas} hrs</span>
          )}
          {negocio && (
            <span className="chip chip-cyan text-[10px]">🏢 {negocio.nombre}</span>
          )}
          {evento.cliente_telefono && (
            <a href={`tel:${evento.cliente_telefono}`} className="chip chip-green text-[10px]">📞 {evento.cliente_telefono}</a>
          )}
        </div>
      </header>

      {/* Resumen financiero con progress bar */}
      <section className="card-glow p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="label-caps">Cobrado</p>
          <p className="text-[10px] text-zinc-500 tabular-nums">
            {Math.round((totalPagado / Math.max(1, Number(evento.monto_total))) * 100)}% de {formatMoney(Number(evento.monto_total), evento.moneda)}
          </p>
        </div>
        <div className="flex items-baseline justify-between">
          <p className="text-3xl font-black tabular-nums text-emerald-400">
            {formatMoney(totalPagado, evento.moneda)}
          </p>
          {pendiente > 0 && (
            <p className="text-sm font-bold tabular-nums text-amber-400">
              faltan {formatMoney(pendiente, evento.moneda)}
            </p>
          )}
        </div>
        {Number(evento.monto_total) > 0 && (
          <div className="h-2 rounded-full bg-[var(--bg-input)] overflow-hidden">
            <div
              className={cn(
                'h-full transition-all',
                pendiente <= 0.01 ? 'bg-emerald-500'
                : totalPagado > 0 ? 'bg-gradient-to-r from-amber-500 to-emerald-500'
                : 'bg-rose-500/50'
              )}
              style={{ width: `${Math.max(2, Math.min(100, (totalPagado / Number(evento.monto_total)) * 100))}%` }}
            />
          </div>
        )}
      </section>

      {/* CTA Cobrar restante */}
      {pendiente > 0 && evento.estado !== 'cancelado' && evento.estado !== 'pagado_proveedor' && (
        <a
          href="#registrar-pago"
          className="card border-emerald-500/40 bg-emerald-500/5 p-3 flex items-center gap-3 hover:bg-emerald-500/10 transition-colors"
        >
          <span className="text-2xl">💰</span>
          <div className="flex-1 leading-tight">
            <p className="text-sm font-bold text-emerald-300">Cobrar restante</p>
            <p className="text-[11px] text-emerald-300/70 tabular-nums">
              {formatMoney(pendiente, evento.moneda)} pendiente
            </p>
          </div>
          <Plus className="h-5 w-5 text-emerald-400" />
        </a>
      )}

      {/* Split de comisión */}
      <div className="card-glow p-4 space-y-2">
        <p className="label-caps">Distribución al finalizar</p>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <p className="text-xs text-zinc-500">Comisión socios ({evento.comision_porcentaje}%)</p>
            <p className="text-lg font-bold tabular-nums text-emerald-400">{formatMoney(comision, evento.moneda)}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Pago al proveedor ({100 - Number(evento.comision_porcentaje)}%)</p>
            <p className="text-lg font-bold tabular-nums text-rose-400">{formatMoney(proveedor, evento.moneda)}</p>
          </div>
        </div>
        {evento.proveedor_nombre && (
          <p className="text-[11px] text-zinc-500 pt-1">→ {evento.proveedor_nombre}</p>
        )}
      </div>

      {/* Acciones de estado */}
      <div className="space-y-2">
        {evento.estado === 'reservado' && evento.fecha_evento <= hoy && (
          <form action={realizarEvento.bind(null, id)}>
            <button type="submit" className="btn-primary w-full">
              <PartyPopper className="h-4 w-4" /> Marcar como realizado
            </button>
          </form>
        )}
        {evento.estado === 'realizado' && !evento.proveedor_pagado && (
          <form action={pagarProveedor.bind(null, id, null)}>
            <button type="submit" className="btn-primary w-full">
              <ExternalLink className="h-4 w-4" /> Pagar {formatMoney(proveedor, evento.moneda)} a {evento.proveedor_nombre ?? 'proveedor'}
            </button>
          </form>
        )}
      </div>

      {/* Pagos */}
      <section className="space-y-2">
        <h2 className="label-caps">Pagos del cliente ({pagos?.length ?? 0})</h2>
        {pagos && pagos.length > 0 ? (
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {pagos.map((p) => (
              <li key={p.id} className="flex items-center justify-between p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{p.concepto || 'Pago'}</p>
                  <p className="text-xs text-zinc-500">{formatearFecha(p.fecha_pago, 'dd MMM yyyy')}</p>
                </div>
                <p className="font-bold tabular-nums text-emerald-400">
                  {formatMoney(Number(p.monto), p.moneda as 'MXN' | 'USD')}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500 italic">Sin pagos aún</p>
        )}
      </section>

      {/* Form para nuevo pago */}
      {pendiente > 0 && evento.estado !== 'cancelado' && evento.estado !== 'pagado_proveedor' && (
        <section id="registrar-pago" className="card-glow p-4 space-y-3 scroll-mt-20">
          <p className="label-caps inline-flex items-center gap-1.5"><Plus className="h-3 w-3" /> Registrar pago</p>
          <PagoEventoForm
            eventoId={id}
            moneda={evento.moneda as 'MXN' | 'USD'}
            pendiente={pendiente}
            cuentas={cuentas ?? []}
          />
        </section>
      )}

      {/* Notas */}
      {evento.notas && (
        <div className="card p-3">
          <p className="text-xs text-zinc-400">{evento.notas}</p>
        </div>
      )}
    </div>
  )
}
