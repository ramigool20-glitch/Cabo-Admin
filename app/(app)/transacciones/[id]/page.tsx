import Link from 'next/link'
import { ChevronLeft, Pencil, Building, CreditCard, Calendar, Tag, FileText, ArrowUpCircle, ArrowDownCircle, DollarSign } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'

export default async function DetalleTransaccionPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params
  const supabase = await createClient()

  const { data: t } = await supabase
    .from('transacciones')
    .select(`
      id, tipo, monto, moneda, fecha, concepto, categoria, notas,
      metodo_pago, metodo_captura, foto_url,
      monto_mxn_equivalente, tipo_cambio_usado,
      created_at, capturado_por,
      negocios(nombre),
      cuentas(nombre),
      profiles!transacciones_capturado_por_fkey(nombre)
    `)
    .eq('id', id)
    .single()

  if (!t) notFound()

  const isGasto = t.tipo === 'gasto' || t.tipo === 'multa_interna'
  const Icon = isGasto ? ArrowDownCircle : ArrowUpCircle
  const colorClass = isGasto ? 'text-rose-400' : 'text-emerald-400'
  const negocio = t.negocios as unknown as { nombre: string } | null
  const cuenta = t.cuentas as unknown as { nombre: string } | null
  const capturador = t.profiles as unknown as { nombre: string } | null
  const editable = t.tipo === 'ingreso' || t.tipo === 'gasto'

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <Link href="/transacciones" className="inline-flex items-center gap-1 text-sm text-zinc-400">
          <ChevronLeft className="h-4 w-4" />
          Transacciones
        </Link>
        {editable && (
          <Link
            href={`/transacciones/${id}/editar`}
            className="btn-ghost h-9 px-3 text-xs"
          >
            <Pencil className="h-3 w-3" />
            Editar
          </Link>
        )}
      </div>

      {/* Hero: monto + tipo */}
      <section className="card-glow p-5 space-y-2">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-5 w-5', colorClass)} />
          <span className={cn('label-caps', colorClass)}>{t.tipo}</span>
        </div>
        <p className={cn('text-4xl font-black tabular-nums', colorClass)}>
          {isGasto ? '−' : '+'}{formatMoney(Number(t.monto), t.moneda as 'MXN' | 'USD')}
        </p>
        {t.moneda === 'USD' && t.monto_mxn_equivalente != null && t.tipo_cambio_usado != null && (
          <p className="text-xs text-cyan-400 inline-flex items-center gap-1.5">
            <DollarSign className="h-3 w-3" />
            ≈ {formatMoney(Number(t.monto_mxn_equivalente), 'MXN')}
            <span className="text-zinc-500">· rate ${Number(t.tipo_cambio_usado).toFixed(2)}</span>
          </p>
        )}
        {t.concepto && (
          <p className="text-base text-zinc-200 pt-1">{t.concepto}</p>
        )}
      </section>

      {/* Datos */}
      <div className="card p-4 space-y-2.5 text-sm">
        <DataRow icon={<Calendar className="h-3.5 w-3.5" />} label="Fecha" value={formatearFecha(t.fecha, 'EEEE dd MMM yyyy')} />
        {negocio && <DataRow icon={<Building className="h-3.5 w-3.5" />} label="Negocio" value={negocio.nombre} />}
        {cuenta && <DataRow icon={<CreditCard className="h-3.5 w-3.5" />} label="Cuenta" value={cuenta.nombre} />}
        {t.categoria && <DataRow icon={<Tag className="h-3.5 w-3.5" />} label="Categoría" value={<span className="capitalize">{t.categoria}</span>} />}
        {t.metodo_pago && <DataRow icon={<CreditCard className="h-3.5 w-3.5" />} label="Método" value={<span className="capitalize">{t.metodo_pago.replace(/_/g, ' ')}</span>} />}
        {t.notas && <DataRow icon={<FileText className="h-3.5 w-3.5" />} label="Notas" value={<span className="text-right block max-w-[60%]">{t.notas}</span>} />}
      </div>

      {/* Captura */}
      <div className="card p-4 space-y-2 text-sm">
        <p className="label-caps">Captura</p>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Método</span>
          <span className="text-white capitalize">{t.metodo_captura}</span>
        </div>
        {capturador && (
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Capturó</span>
            <span className="text-white">{capturador.nombre}</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Creada</span>
          <span className="text-zinc-300 text-xs">{formatearFecha(t.created_at, 'dd MMM yyyy HH:mm')}</span>
        </div>
      </div>

      {/* Comprobante */}
      {t.foto_url && (
        <div className="card overflow-hidden">
          <div className="p-3 pb-1">
            <p className="label-caps">Comprobante</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={t.foto_url}
            alt="Comprobante"
            className="w-full max-h-96 object-contain bg-black"
          />
        </div>
      )}
    </div>
  )
}

function DataRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-500 inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="text-white text-right">{value}</span>
    </div>
  )
}
