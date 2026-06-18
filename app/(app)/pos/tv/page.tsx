import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { TvDashboardClient } from '@/components/pos/tv-dashboard-client'

export const dynamic = 'force-dynamic'

export default async function TvDashboardPage() {
  const admin = createAdminClient()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Solo admin/socio (no cajera)
  let bloqueado = true
  if (user) {
    const { data: prof } = await admin
      .from('profiles')
      .select('roles(nombre)')
      .eq('id', user.id)
      .single()
    const rol = (prof?.roles as unknown as { nombre: string } | null)?.nombre
    if (rol === 'admin' || rol === 'socio') bloqueado = false
  }

  if (bloqueado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
        <p className="text-lg">Acceso denegado. Solo admin.</p>
      </div>
    )
  }

  // Estado inicial: hoy
  const hoyStr = new Date().toISOString().slice(0, 10)
  const { data: cvu } = await admin
    .from('negocios')
    .select('id, nombre')
    .ilike('nombre', '%cvu pharmacy local%')
    .maybeSingle()

  type Tx = { id: string; monto: number; ganancia_estimada_mxn: number | null; costo_total_mxn: number | null; created_at: string }
  const { data: ventas } = await admin
    .from('transacciones')
    .select('id, monto, ganancia_estimada_mxn, costo_total_mxn, created_at')
    .eq('tiene_items', true)
    .eq('tipo', 'ingreso')
    .gte('fecha', hoyStr)
    .order('created_at', { ascending: false })
  const txs = (ventas ?? []) as Tx[]
  const ventasTotal = txs.reduce((s, t) => s + Number(t.monto ?? 0), 0)
  const gananciaTotal = txs.reduce((s, t) => s + Number(t.ganancia_estimada_mxn ?? 0), 0)
  const costoTotal = txs.reduce((s, t) => s + Number(t.costo_total_mxn ?? 0), 0)

  // Top productos del día
  let topProductos: Array<{ nombre: string; unidades: number; ganancia: number }> = []
  if (txs.length > 0) {
    const ids = txs.map(t => t.id)
    const { data: items } = await admin
      .from('venta_items')
      .select('nombre_snapshot, cantidad, ganancia_mxn')
      .in('transaccion_id', ids)
    const agg = new Map<string, { unidades: number; ganancia: number }>()
    for (const it of items ?? []) {
      const key = it.nombre_snapshot as string
      const prev = agg.get(key) ?? { unidades: 0, ganancia: 0 }
      agg.set(key, {
        unidades: prev.unidades + Number(it.cantidad ?? 0),
        ganancia: prev.ganancia + Number(it.ganancia_mxn ?? 0),
      })
    }
    topProductos = Array.from(agg.entries())
      .map(([nombre, v]) => ({ nombre, ...v }))
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 5)
  }

  return (
    <TvDashboardClient
      negocioId={cvu?.id ?? null}
      ventasInicial={ventasTotal}
      gananciaInicial={gananciaTotal}
      costoInicial={costoTotal}
      countInicial={txs.length}
      ultimasVentas={txs.slice(0, 5).map(t => ({
        id: t.id,
        monto: Number(t.monto),
        hora: t.created_at,
      }))}
      topProductos={topProductos}
    />
  )
}
