import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import { RecurrenteForm } from '@/components/recurrentes/recurrente-form'
import { MarcarPagadoForm } from '@/components/recurrentes/marcar-pagado-form'

export default async function DetalleRecurrentePage(
  props: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }
) {
  const { id } = await props.params
  const { edit } = await props.searchParams

  const supabase = await createClient()
  const admin = createAdminClient()

  const [{ data: r }, { data: negocios }, { data: cuentas }, { data: perfiles }, { data: pagados }] =
    await Promise.all([
      supabase.from('gastos_recurrentes').select('*').eq('id', id).single(),
      supabase.from('negocios').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('cuentas').select('id, nombre, moneda').eq('activo', true).order('nombre'),
      admin.from('profiles').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('recurrentes_pagados').select('id, fecha_pago, monto_pagado').eq('recurrente_id', id).order('fecha_pago', { ascending: false }).limit(6),
    ])

  if (!r) notFound()

  if (edit) {
    return (
      <div className="px-4 pt-4 pb-6 space-y-4">
        <Link href={`/recurrentes/${id}`} className="inline-flex items-center gap-1 text-sm text-zinc-600">
          <ChevronLeft className="h-4 w-4" /> {r.nombre}
        </Link>
        <header><h1 className="text-2xl font-bold tracking-tight">Editar</h1></header>
        <RecurrenteForm
          negocios={negocios ?? []}
          cuentas={cuentas ?? []}
          perfiles={perfiles ?? []}
          defaults={{
            id: r.id,
            nombre: r.nombre,
            monto: String(r.monto),
            moneda: r.moneda as 'MXN' | 'USD',
            negocio_id: r.negocio_id,
            cuenta_id: r.cuenta_id,
            responsable_id: r.responsable_id,
            metodo_pago: r.metodo_pago,
            proveedor: r.proveedor,
            referencia_pago: r.referencia_pago,
            comprobante_requerido: r.comprobante_requerido,
            frecuencia: r.frecuencia,
            dia_del_mes: r.dia_del_mes,
            proximo_pago: r.proximo_pago,
            multa_por_no_pago: r.multa_por_no_pago !== null ? String(r.multa_por_no_pago) : null,
            categoria: r.categoria,
            notas: r.notas,
          }}
        />
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 pb-6 space-y-5">
      <Link href="/recurrentes" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" /> Gastos Fijos
      </Link>

      <header className="space-y-1 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{r.nombre}</h1>
          <p className="text-sm text-zinc-400 capitalize">
            {r.frecuencia} · {formatMoney(Number(r.monto), r.moneda)}
          </p>
        </div>
        <Link
          href={`/recurrentes/${id}?edit=1`}
          aria-label="Editar"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-zinc-600"
        >
          <Pencil className="h-4 w-4" />
        </Link>
      </header>

      {/* Datos */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 space-y-2 text-sm">
        <Row label="Próximo pago" value={r.proximo_pago ? formatearFecha(r.proximo_pago, 'EEEE dd MMM yyyy') : '—'} />
        <Row label="Proveedor" value={r.proveedor || '—'} />
        <Row label="Método" value={r.metodo_pago || '—'} />
        <Row label="Referencia" value={r.referencia_pago || '—'} />
        <Row label="Comprobante" value={r.comprobante_requerido ? 'Requerido' : 'Opcional'} />
        {r.multa_por_no_pago && (
          <Row label="Multa si no se paga" value={formatMoney(Number(r.multa_por_no_pago), 'MXN')} />
        )}
      </div>

      {/* Marcar pagado */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Marcar como pagado</p>
        <MarcarPagadoForm
          recurrenteId={r.id}
          monto={Number(r.monto)}
          comprobanteRequerido={!!r.comprobante_requerido}
        />
      </div>

      {/* Histórico */}
      {pagados && pagados.length > 0 && (
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Pagos recientes</p>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {pagados.map((p) => (
              <li key={p.id} className="flex justify-between py-2 text-sm">
                <span>{formatearFecha(p.fecha_pago, 'dd MMM yyyy')}</span>
                <span className="font-medium tabular-nums">{formatMoney(Number(p.monto_pagado), r.moneda)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-right break-all">{value}</span>
    </div>
  )
}
