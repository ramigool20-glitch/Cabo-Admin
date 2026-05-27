import Link from 'next/link'
import { ChevronLeft, Pencil, Building, CreditCard, Calendar, Tag, FileText, ArrowUpCircle, ArrowDownCircle, DollarSign, History, Plus, Edit3, Trash2 as TrashIcon } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney, cn } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import { TZ } from '@/lib/fechas'
import { formatInTimeZone } from 'date-fns-tz'

export default async function DetalleTransaccionPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params
  const supabase = await createClient()

  // Defensive: si atribuido_a no existe (migración 0012 no aplicada), reintenta sin
  const baseCols = 'id, tipo, monto, moneda, fecha, concepto, categoria, notas, metodo_pago, metodo_captura, foto_url, monto_mxn_equivalente, tipo_cambio_usado, created_at, capturado_por, negocios(nombre, tipo), cuentas(nombre)'
  let tRes = await supabase
    .from('transacciones')
    .select(`${baseCols}, atribuido_a`)
    .eq('id', id)
    .maybeSingle()
  if (tRes.error && /atribuido_a/.test(tRes.error.message ?? '')) {
    tRes = await supabase
      .from('transacciones')
      .select(baseCols)
      .eq('id', id)
      .maybeSingle()
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t: any = tRes.data

  if (!t) notFound()

  // Capturador via query separada — más robusto que joins con FK constraint name
  let capturador: { nombre: string } | null = null
  if (t.capturado_por) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('nombre')
      .eq('id', t.capturado_por)
      .maybeSingle()
    capturador = prof
  }

  // Atribución (para gastos Casa)
  let atribuidoNombre: string | null = null
  if (t.atribuido_a) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('nombre')
      .eq('id', t.atribuido_a)
      .maybeSingle()
    atribuidoNombre = prof?.nombre ?? null
  }

  // Historial (defensive: tabla puede no existir si mig 0013 no aplicada)
  const admin = createAdminClient()
  const historialRes = await admin
    .from('transaccion_historial')
    .select('id, accion, cambios, modificada_por, created_at')
    .eq('transaccion_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  type HistEntry = {
    id: string
    accion: 'creada' | 'editada' | 'eliminada'
    cambios: Record<string, { antes: unknown; despues: unknown }> | null
    modificada_por: string | null
    created_at: string
    nombre?: string
  }
  let historial: HistEntry[] = (historialRes.data as HistEntry[] | null) ?? []
  // Cargar nombres de quienes modificaron
  if (historial.length > 0) {
    const ids = Array.from(new Set(historial.map((h) => h.modificada_por).filter(Boolean) as string[]))
    if (ids.length > 0) {
      const { data: profs } = await admin.from('profiles').select('id, nombre').in('id', ids)
      const nombrePorId = new Map((profs ?? []).map((p) => [p.id, p.nombre]))
      historial = historial.map((h) => ({ ...h, nombre: h.modificada_por ? nombrePorId.get(h.modificada_por) ?? '—' : '—' }))
    }
  }

  const isGasto = t.tipo === 'gasto' || t.tipo === 'multa_interna'
  const Icon = isGasto ? ArrowDownCircle : ArrowUpCircle
  const colorClass = isGasto ? 'text-rose-400' : 'text-emerald-400'
  const negocio = t.negocios as unknown as { nombre: string; tipo: string } | null
  const cuenta = t.cuentas as unknown as { nombre: string } | null
  const esCasa = negocio?.tipo === 'casa'
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
        {esCasa && (
          <div className="pt-1">
            {atribuidoNombre ? (
              <span className="chip chip-purple text-[10px]">👤 Personal de {atribuidoNombre}</span>
            ) : (
              <span className="chip chip-cyan text-[10px]">⚖ Compartido (split 50/50)</span>
            )}
          </div>
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

      {/* Historial de cambios */}
      {historial.length > 0 && (
        <section className="space-y-2">
          <h2 className="label-caps inline-flex items-center gap-1.5">
            <History className="h-3 w-3" /> Historial de cambios ({historial.length})
          </h2>
          <ul className="card divide-y divide-[var(--border-subtle)] overflow-hidden">
            {historial.map((h) => {
              const IconHist = h.accion === 'creada' ? Plus : h.accion === 'editada' ? Edit3 : TrashIcon
              const iconColor =
                h.accion === 'creada' ? 'text-emerald-400'
                : h.accion === 'editada' ? 'text-cyan-400'
                : 'text-rose-400'
              const fechaLocal = formatInTimeZone(new Date(h.created_at), TZ, 'dd MMM yyyy HH:mm')
              return (
                <li key={h.id} className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <IconHist className={cn('h-4 w-4 shrink-0', iconColor)} />
                      <div className="leading-tight">
                        <p className="text-sm font-bold text-white">
                          {h.accion === 'creada' ? 'Creada' : h.accion === 'editada' ? 'Editada' : 'Eliminada'}
                          {' por '}
                          <span className="text-cyan-300">{h.nombre ?? '—'}</span>
                        </p>
                        <p className="text-[10px] text-zinc-500">{fechaLocal}</p>
                      </div>
                    </div>
                  </div>
                  {h.accion === 'editada' && h.cambios && Object.keys(h.cambios).length > 0 && (
                    <ul className="space-y-0.5 pl-6 text-[11px]">
                      {Object.entries(h.cambios).map(([campo, { antes, despues }]) => (
                        <li key={campo} className="text-zinc-400">
                          <span className="text-zinc-500 uppercase tracking-wider text-[9px]">{campo.replace(/_/g, ' ')}</span>{' '}
                          <span className="text-rose-400/80 line-through">{formatValor(antes)}</span>{' → '}
                          <span className="text-emerald-300">{formatValor(despues)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function formatValor(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'number') return v.toString()
  if (typeof v === 'string') {
    // Si es UUID, truncar
    if (/^[0-9a-f-]{36}$/.test(v)) return v.slice(0, 8) + '…'
    return v
  }
  return String(v)
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
