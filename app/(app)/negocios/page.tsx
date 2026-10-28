import { OPERATION_START } from '@/lib/operacion'
import { createClient } from '@/lib/supabase/server'
import { requireOwner } from '@/lib/auth/require-owner'
import { totalizar } from '@/lib/agregaciones'
import { rangoFechas } from '@/lib/rangos'
import { desdeOperacion } from '@/lib/operacion'
import { BusinessPortfolio } from '@/components/negocios/business-portfolio'

export default async function NegociosPage() {
  await requireOwner()
  const db = await createClient()
  const periodo = rangoFechas('mes_actual')
  const desde = desdeOperacion(periodo.desde)
  const [negociosRes, txRes, fxRes] = await Promise.all([
    db.from('negocios').select('id,nombre,tipo,url,color_primario,moneda_principal').eq('activo', true).order('nombre'),
    db.from('transacciones').select('tipo,monto,moneda,fecha,categoria,negocio_id,monto_mxn_equivalente,tipo_cambio_usado').gte('fecha', OPERATION_START).gte('fecha', desde).lte('fecha',periodo.hasta),
    db.from('fx_rates').select('rate_compra').order('fecha',{ascending:false}).limit(1).maybeSingle(),
  ])
  if (negociosRes.error || txRes.error) throw new Error('No se pudieron cargar tus negocios. Intenta de nuevo.')
  const fx = fxRes.data ? Number(fxRes.data.rate_compra) : null
  const rows = txRes.data ?? []
  const businesses = (negociosRes.data ?? []).map(n => {
    const movimientos = rows.filter(t => t.negocio_id === n.id)
    const total = totalizar(movimientos, fx)
    return { ...n, ingresos:total.ingresos_total_mxn,gastos:total.gastos_total_mxn,resultado:total.utilidad_total_mxn,movimientos:movimientos.length }
  })
  return <BusinessPortfolio businesses={businesses} desde={desde} />
}
