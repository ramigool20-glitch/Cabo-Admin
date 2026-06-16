/**
 * Pantalla "1-tap" a la que llega el usuario desde el push de un cobro MP.
 * Server component que:
 *   - Carga la tx
 *   - Calcula los top 3 negocios sugeridos (basados en histórico de cobros similares
 *     en la misma cuenta + el negocio_default de la integración)
 *   - Muestra botones grandes que tap → POST /api/transacciones/categorizar
 *   - Botón "más opciones" abre el editor completo
 */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney } from '@/lib/utils'
import { formatearFecha } from '@/lib/fechas'
import { CategorizarBotones } from '@/components/transacciones/categorizar-botones'

export default async function CategorizarTxPage(
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params
  const supabase = await createClient()
  const admin = createAdminClient()

  // Carga la tx + cuenta + negocios activos
  const { data: tx } = await supabase
    .from('transacciones')
    .select('id, tipo, monto, moneda, fecha, concepto, categoria, negocio_id, cuenta_id, metodo_captura, cuentas(nombre), negocios(nombre)')
    .eq('id', id)
    .maybeSingle()

  if (!tx) notFound()

  const { data: negocios } = await supabase
    .from('negocios')
    .select('id, nombre, tipo')
    .eq('activo', true)
    .order('nombre')

  // Top 3 sugerencias por uso histórico en la misma cuenta para cobros similares
  // (mismo tipo, monto cercano si aplica). Caemos a top 3 negocios más usados como
  // backup.
  let sugeridos: { id: string; nombre: string; razon: string }[] = []
  if (tx.cuenta_id) {
    const { data: histRows } = await admin
      .from('transacciones')
      .select('negocio_id, negocios(nombre)')
      .eq('cuenta_id', tx.cuenta_id)
      .eq('tipo', tx.tipo)
      .not('negocio_id', 'is', null)
      .order('fecha', { ascending: false })
      .limit(200)
    const conteo = new Map<string, { nombre: string; n: number }>()
    for (const row of histRows ?? []) {
      const nid = row.negocio_id as string | null
      if (!nid) continue
      const nNombre = (row.negocios as unknown as { nombre: string } | null)?.nombre ?? ''
      const cur = conteo.get(nid) ?? { nombre: nNombre, n: 0 }
      cur.n++
      conteo.set(nid, cur)
    }
    sugeridos = [...conteo.entries()]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 3)
      .map(([id, v]) => ({ id, nombre: v.nombre, razon: `${v.n} cobros previos` }))
  }
  // Si no hay sugerencias por histórico, top 3 negocios por orden alfabético
  if (sugeridos.length === 0) {
    sugeridos = (negocios ?? []).slice(0, 3).map((n) => ({ id: n.id, nombre: n.nombre, razon: 'negocio activo' }))
  }

  const yaCategorizada = !!tx.negocio_id && !!tx.categoria

  return (
    <div className="px-4 pt-4 pb-24 space-y-5 max-w-2xl mx-auto">
      <Link href="/transacciones" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" />
        Transacciones
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-black heading-gradient">
          {yaCategorizada ? 'Cobro ya categorizado' : '¿De qué fue este cobro?'}
        </h1>
        <p className="text-xs text-zinc-400">
          {formatearFecha(tx.fecha, 'EEEE, dd MMM')} · {(tx.cuentas as unknown as { nombre: string } | null)?.nombre ?? '—'}
        </p>
      </header>

      <div className="rounded-2xl border border-emerald-700/30 bg-emerald-950/20 p-5 text-center space-y-1">
        <p className="text-3xl font-black text-emerald-400 tabular-nums">
          +{formatMoney(Number(tx.monto), tx.moneda as 'MXN' | 'USD')}
        </p>
        {tx.concepto && (
          <p className="text-sm text-zinc-300 truncate">{tx.concepto}</p>
        )}
        {yaCategorizada && (
          <p className="text-xs text-emerald-300 inline-flex items-center gap-1 justify-center pt-1">
            <Sparkles className="h-3 w-3" /> Asignado a "{(tx.negocios as unknown as { nombre: string } | null)?.nombre ?? '—'}"
          </p>
        )}
      </div>

      <CategorizarBotones
        txId={tx.id}
        sugeridos={sugeridos}
        todos={(negocios ?? []).map((n) => ({ id: n.id, nombre: n.nombre }))}
        categoriaPropuesta={tx.categoria}
      />

      <Link
        href={`/transacciones/${tx.id}`}
        className="block text-center text-sm text-cyan-400 underline-offset-2 hover:underline"
      >
        Editar todos los campos →
      </Link>
    </div>
  )
}
