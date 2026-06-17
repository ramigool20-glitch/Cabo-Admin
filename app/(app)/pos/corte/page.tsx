/**
 * Pantalla de corte de caja del POS.
 * Calcula el esperado de hoy desde transacciones tipo='ingreso' con
 * tiene_items=true por método de pago, y permite a la cajera capturar
 * lo CONTADO físicamente. Diferencia automática.
 */

import Link from 'next/link'
import { ChevronLeft, AlertTriangle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { CorteCajaClient } from '@/components/pos/corte-caja-client'

export const dynamic = 'force-dynamic'

export default async function CorteCajaPage() {
  const admin = createAdminClient()
  const supabase = await createClient()

  // Negocio CVU Pharmacy
  const { data: negocio } = await admin
    .from('negocios')
    .select('id, nombre')
    .ilike('nombre', '%cvu pharmacy local%')
    .eq('activo', true)
    .maybeSingle()

  // Usuario
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  // Defensive: verifica tabla cortes_caja
  let tablaExiste = true
  try {
    const probe = await admin.from('cortes_caja').select('id').limit(1)
    if (probe.error) tablaExiste = false
  } catch {
    tablaExiste = false
  }

  if (!tablaExiste) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 max-w-md space-y-3 text-center">
          <AlertTriangle className="h-10 w-10 text-amber-300 mx-auto" />
          <p className="text-lg font-bold text-amber-200">Aplica la migración 0044</p>
          <p className="text-sm text-amber-200/80">La tabla <code className="font-mono">cortes_caja</code> aún no existe.</p>
        </div>
      </div>
    )
  }

  if (!negocio) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 max-w-md space-y-3 text-center">
          <AlertTriangle className="h-10 w-10 text-rose-300 mx-auto" />
          <p className="text-lg font-bold text-rose-200">Falta el negocio Cvu Pharmacy</p>
        </div>
      </div>
    )
  }

  // Calcular esperados del día desde transacciones con items
  const hoy = new Date().toISOString().slice(0, 10)
  type Tx = {
    id: string; monto: number; metodo_pago: string | null
    ganancia_estimada_mxn: number | null
    cajera_id?: string | null; capturado_por?: string | null
  }
  const { data: txData } = await admin
    .from('transacciones')
    .select('id, monto, metodo_pago, ganancia_estimada_mxn, capturado_por')
    .eq('tiene_items', true)
    .eq('tipo', 'ingreso')
    .eq('negocio_id', negocio.id)
    .eq('fecha', hoy)
  let txs = (txData ?? []) as Tx[]

  // Si es cajera específica, filtrar solo sus ventas
  // (puedes comentar esto si quieres ver TODAS las ventas del negocio)
  if (userId) {
    const { data: prof } = await admin
      .from('profiles')
      .select('roles(nombre)')
      .eq('id', userId)
      .single()
    const rol = (prof?.roles as unknown as { nombre: string } | null)?.nombre
    if (rol === 'cajera') {
      txs = txs.filter(t => t.capturado_por === userId)
    }
  }

  let efectivo = 0, mp = 0, tarjeta = 0, transfer = 0
  let ganancia = 0
  for (const t of txs) {
    const m = String(t.metodo_pago ?? '').toLowerCase()
    const monto = Number(t.monto ?? 0)
    if (m.includes('efectivo')) efectivo += monto
    else if (m.startsWith('mp_')) mp += monto
    else if (m === 'tarjeta' || m.includes('stripe')) tarjeta += monto
    else if (m.includes('transferencia')) transfer += monto
    else efectivo += monto  // unknowns van a efectivo por seguridad
    ganancia += Number(t.ganancia_estimada_mxn ?? 0)
  }
  const total = efectivo + mp + tarjeta + transfer

  // Unidades vendidas (de venta_items del día para este negocio/cajera)
  const txIds = txs.map(t => t.id)
  let unidades = 0
  if (txIds.length > 0) {
    const { data: items } = await admin
      .from('venta_items')
      .select('cantidad')
      .in('transaccion_id', txIds)
    unidades = (items ?? []).reduce((s, i) => s + Number(i.cantidad ?? 0), 0)
  }

  return (
    <div className="px-4 pt-4 pb-32 space-y-4 max-w-2xl mx-auto">
      <Link href="/pos" className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" />
        Volver al POS
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-black heading-gradient">Corte de caja</h1>
        <p className="text-[11px] text-zinc-500">
          {hoy} · {negocio.nombre}
        </p>
      </header>

      <CorteCajaClient
        negocioId={negocio.id}
        fecha={hoy}
        esperado={{
          efectivo,
          mp,
          tarjeta,
          transfer,
          total,
        }}
        ventasCount={txs.length}
        unidades={unidades}
        ganancia={ganancia}
      />
    </div>
  )
}
