import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { totalizar } from '@/lib/agregaciones'
import { rangoFechas } from '@/lib/rangos'
import { formatMoney, cn } from '@/lib/utils'

const tipoMeta: Record<string, { emoji: string; gradient: string; label: string }> = {
  farmacia:       { emoji: '💊', gradient: 'from-emerald-500 to-teal-500',    label: 'Farmacia local' },
  consultorio:    { emoji: '🩺', gradient: 'from-blue-500 to-cyan-500',       label: 'Clínica' },
  pagina_digital: { emoji: '🌐', gradient: 'from-purple-500 to-pink-500',     label: 'Online' },
  general:        { emoji: '💼', gradient: 'from-zinc-500 to-zinc-600',       label: 'General' },
}

export default async function NegociosPage() {
  const supabase = createAdminClient()
  const r = rangoFechas('mes_actual')

  const { data: negocios } = await supabase
    .from('negocios')
    .select('id, nombre, tipo, moneda_principal, activo, url')
    .eq('activo', true)
    .order('tipo')
    .order('nombre')

  // Trae los totales del mes por negocio (admin = bypassa RLS)
  const { data: txMes } = await supabase
    .from('transacciones')
    .select('tipo, monto, moneda, fecha, categoria, negocio_id')
    .gte('fecha', r.desde)
    .lte('fecha', r.hasta)

  const rowsPorNegocio = new Map<string, typeof txMes>()
  for (const t of txMes ?? []) {
    if (!t.negocio_id) continue
    if (!rowsPorNegocio.has(t.negocio_id)) rowsPorNegocio.set(t.negocio_id, [])
    rowsPorNegocio.get(t.negocio_id)!.push(t)
  }

  return (
    <div className="px-4 pt-5 pb-8 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black heading-gradient">Negocios</h1>
        <span className="chip">{negocios?.length ?? 0} activos</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {negocios?.map((n) => {
          const meta = tipoMeta[n.tipo] ?? tipoMeta.general
          const t = totalizar(rowsPorNegocio.get(n.id) ?? [])
          const utilidad = t.utilidad_mxn + (t.utilidad_usd ? t.utilidad_usd * 17 : 0) // estimación
          const positiva = utilidad >= 0
          const url = (n as { url?: string | null }).url

          return (
            <Link
              key={n.id}
              href={`/negocios/${n.id}`}
              className="card hover:bg-[var(--bg-card-hover)] transition-colors p-4 space-y-3 group"
            >
              {/* Header: emoji + nombre + chip */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  'h-11 w-11 inline-flex items-center justify-center rounded-xl bg-gradient-to-br text-xl shrink-0',
                  meta.gradient
                )}>
                  {meta.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white truncate">{n.nombre}</p>
                  <p className="text-xs text-zinc-500 truncate">{meta.label}</p>
                </div>
                <span className="chip chip-green text-[10px]">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                  Activo
                </span>
              </div>

              {/* Utilidad del mes */}
              <div className="space-y-0.5">
                <p className="label-caps">Utilidad del mes</p>
                <p className={cn(
                  'text-2xl font-black tabular-nums',
                  positiva ? 'text-emerald-300' : 'text-rose-300'
                )}>
                  {positiva ? '+' : ''}{formatMoney(t.utilidad_mxn, 'MXN')}
                </p>
              </div>

              {/* Métricas */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="label-caps">Ingresos</p>
                  <p className="text-sm font-bold text-emerald-400 tabular-nums">
                    {formatMoney(t.ingresos_mxn, 'MXN')}
                  </p>
                </div>
                <div>
                  <p className="label-caps">Gastos</p>
                  <p className="text-sm font-bold text-rose-400 tabular-nums">
                    {formatMoney(t.gastos_mxn, 'MXN')}
                  </p>
                </div>
              </div>

              {/* URL si existe */}
              {url && (
                <p className="text-[10px] text-cyan-400/60 truncate pt-1 border-t border-[var(--border-subtle)]">
                  🔗 {url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </p>
              )}

              <div className="flex items-center justify-end text-xs text-cyan-400 group-hover:text-cyan-300">
                Ver detalle <ChevronRight className="h-3 w-3 ml-0.5" />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
