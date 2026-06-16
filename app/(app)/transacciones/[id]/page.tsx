import Link from 'next/link'
import { ChevronLeft, History, Plus, Edit3, Trash2 as TrashIcon } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { cn } from '@/lib/utils'
import { TZ } from '@/lib/fechas'
import { formatInTimeZone } from 'date-fns-tz'
import { TransactionForm } from '@/components/transacciones/transaction-form'
import { VentaItemsResumen, type VentaItemRow } from '@/components/transacciones/venta-items-resumen'

export default async function EditarTransaccionPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params
  const supabase = await createClient()
  const admin = createAdminClient()

  // Defensive: si atribuido_a no existe, reintenta sin
  const baseCols = 'id, tipo, monto, moneda, fecha, negocio_id, cuenta_id, metodo_pago, categoria, concepto, notas, monto_mxn_equivalente, tipo_cambio_usado, foto_url'
  let tRes = await supabase.from('transacciones')
    .select(`${baseCols}, atribuido_a, ganancia_estimada_mxn, costo_total_mxn, tiene_items`)
    .eq('id', id)
    .maybeSingle()
  if (tRes.error && /(atribuido_a|tiene_items|ganancia_estimada_mxn|costo_total_mxn)/.test(tRes.error.message ?? '')) {
    // Sin columnas extra de 0043
    tRes = await supabase.from('transacciones')
      .select(`${baseCols}, atribuido_a`)
      .eq('id', id).maybeSingle()
    if (tRes.error && /atribuido_a/.test(tRes.error.message ?? '')) {
      tRes = await supabase.from('transacciones').select(baseCols).eq('id', id).maybeSingle()
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t: any = tRes.data
  if (!t) notFound()

  // Carga options para el form
  const [{ data: negocios }, { data: cuentas }, { data: socios }, { data: integMp }] = await Promise.all([
    supabase.from('negocios').select('id, nombre, tipo, moneda_principal').eq('activo', true).order('nombre'),
    supabase.from('cuentas').select('id, nombre, tipo, moneda').eq('activo', true).order('nombre'),
    admin.from('profiles').select('id, nombre, role_id, roles(nombre)').eq('activo', true),
    admin.from('integraciones_mp').select('cuenta_id').eq('activa', true),
  ])

  const cuentasConIntegMp = new Set((integMp ?? []).map((r) => r.cuenta_id).filter(Boolean) as string[])
  const cuentasOpts = (cuentas ?? []).map((c) => ({
    ...c,
    integracion_mp: cuentasConIntegMp.has(c.id),
  }))

  const sociosFiltered = (socios ?? [])
    .filter((p) => {
      const r = p.roles as unknown as { nombre: string } | null
      return r?.nombre === 'admin' || r?.nombre === 'socio'
    })
    .map((p) => ({ id: p.id, nombre: p.nombre }))

  const editable = t.tipo === 'ingreso' || t.tipo === 'gasto'

  // Si la transacción tiene foto guardada, generar signed URL para mostrarla en el form
  let fotoExistenteUrl: string | null = null
  if (t.foto_url) {
    const { data: signed } = await admin.storage.from('recibos').createSignedUrl(t.foto_url, 60 * 60 * 8)
    fotoExistenteUrl = signed?.signedUrl ?? null
  }

  // Venta items (defensive: tabla puede no existir si 0043 no aplicada)
  let ventaItems: VentaItemRow[] = []
  try {
    const { data } = await admin
      .from('venta_items')
      .select('id, nombre_snapshot, codigo_barras_snapshot, categoria_snapshot, cantidad, precio_unitario_mxn, costo_unitario_snapshot_mxn, descuento_pct, descuento_mxn, subtotal_mxn, ganancia_mxn')
      .eq('transaccion_id', id)
      .order('created_at')
    ventaItems = ((data ?? []) as unknown as Array<Record<string, unknown>>).map(r => ({
      id: r.id as string,
      nombre_snapshot: r.nombre_snapshot as string,
      codigo_barras_snapshot: (r.codigo_barras_snapshot as string | null) ?? null,
      categoria_snapshot: (r.categoria_snapshot as string | null) ?? null,
      cantidad: Number(r.cantidad ?? 0),
      precio_unitario_mxn: Number(r.precio_unitario_mxn ?? 0),
      costo_unitario_snapshot_mxn: r.costo_unitario_snapshot_mxn != null ? Number(r.costo_unitario_snapshot_mxn) : null,
      descuento_pct: Number(r.descuento_pct ?? 0),
      descuento_mxn: Number(r.descuento_mxn ?? 0),
      subtotal_mxn: Number(r.subtotal_mxn ?? 0),
      ganancia_mxn: r.ganancia_mxn != null ? Number(r.ganancia_mxn) : null,
    }))
  } catch {
    ventaItems = []
  }

  // Historial (defensive: tabla puede no existir)
  let historial: Array<{
    id: string
    accion: 'creada' | 'editada' | 'eliminada'
    cambios: Record<string, { antes: unknown; despues: unknown }> | null
    modificada_por: string | null
    created_at: string
    nombre?: string
  }> = []
  try {
    const { data } = await admin
      .from('transaccion_historial')
      .select('id, accion, cambios, modificada_por, created_at')
      .eq('transaccion_id', id)
      .order('created_at', { ascending: false })
      .limit(20)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    historial = (data as any[]) ?? []
    if (historial.length > 0) {
      const ids = Array.from(new Set(historial.map((h) => h.modificada_por).filter(Boolean) as string[]))
      if (ids.length > 0) {
        const { data: profs } = await admin.from('profiles').select('id, nombre').in('id', ids)
        const nombrePorId = new Map((profs ?? []).map((p) => [p.id, p.nombre]))
        historial = historial.map((h) => ({ ...h, nombre: h.modificada_por ? nombrePorId.get(h.modificada_por) ?? '—' : '—' }))
      }
    }
  } catch {
    historial = []
  }

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 max-w-2xl mx-auto">
      <Link href="/transacciones" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" />
        Transacciones
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient">Editar transacción</h1>
        <p className="text-xs text-zinc-500">Cambia cualquier campo. Los cambios quedan registrados en el historial.</p>
      </header>

      {/* Resumen de items vendidos (solo si la tx tiene productos) */}
      {ventaItems.length > 0 && (
        <VentaItemsResumen
          items={ventaItems}
          gananciaTotal={t.ganancia_estimada_mxn != null ? Number(t.ganancia_estimada_mxn) : null}
          costoTotal={t.costo_total_mxn != null ? Number(t.costo_total_mxn) : null}
        />
      )}

      {editable ? (
        <TransactionForm
          negocios={negocios ?? []}
          cuentas={cuentasOpts}
          socios={sociosFiltered}
          defaults={{
            id: t.id,
            tipo: t.tipo as 'ingreso' | 'gasto',
            monto: String(t.monto),
            moneda: t.moneda as 'MXN' | 'USD',
            fecha: t.fecha,
            negocio_id: t.negocio_id,
            cuenta_id: t.cuenta_id,
            metodo_pago: t.metodo_pago,
            categoria: t.categoria,
            concepto: t.concepto,
            notas: t.notas,
            monto_mxn_equivalente: t.monto_mxn_equivalente,
            tipo_cambio_usado: t.tipo_cambio_usado,
            atribuido_a: t.atribuido_a,
          }}
          fotoExistenteUrl={fotoExistenteUrl}
        />
      ) : (
        <div className="card border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-300">
          Este tipo de transacción ({t.tipo}) se gestiona desde su módulo correspondiente, no desde aquí.
        </div>
      )}

      {/* Historial de cambios */}
      {historial.length > 0 && (
        <section className="space-y-2 pt-2">
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
                  {h.accion === 'editada' && h.cambios && Object.keys(h.cambios).length > 0 && (
                    <ul className="space-y-0.5 pl-6 text-[11px]">
                      {Object.entries(h.cambios).map(([campo, valor]) => {
                        const v = valor as { antes: unknown; despues: unknown }
                        return (
                          <li key={campo} className="text-zinc-400">
                            <span className="text-zinc-500 uppercase tracking-wider text-[9px]">{campo.replace(/_/g, ' ')}</span>{' '}
                            <span className="text-rose-400/80 line-through">{formatValor(v.antes)}</span>{' → '}
                            <span className="text-emerald-300">{formatValor(v.despues)}</span>
                          </li>
                        )
                      })}
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
    if (/^[0-9a-f-]{36}$/.test(v)) return v.slice(0, 8) + '…'
    return v
  }
  return String(v)
}
