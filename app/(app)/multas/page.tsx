import { AlertTriangle, Scale } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney } from '@/lib/utils'
import { MultaCard, type MultaItem } from '@/components/multas/multa-card'

type BalancePorPersona = {
  profile_id: string
  nombre: string
  multas_aplicadas_mxn: number
  multas_aplicadas_usd: number
}

export default async function MultasPage() {
  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: multasRaw }, { data: perfiles }] = await Promise.all([
    supabase
      .from('multas')
      .select('id, tarea_id, motivo, monto_propuesto, monto_final, moneda, estado, responsable_id, responder_antes_de, created_at, tareas(titulo)')
      .order('created_at', { ascending: false }),
    admin.from('profiles').select('id, nombre').eq('activo', true),
  ])

  const perfilesMap = new Map((perfiles ?? []).map((p) => [p.id, p.nombre]))

  const multas: MultaItem[] = (multasRaw ?? []).map((m) => {
    const tarea = m.tareas as unknown as { titulo: string } | null
    return {
      id: m.id,
      tarea_titulo: tarea?.titulo ?? null,
      monto_propuesto: Number(m.monto_propuesto),
      monto_final: m.monto_final !== null ? Number(m.monto_final) : null,
      moneda: m.moneda as 'MXN' | 'USD',
      motivo: m.motivo,
      estado: m.estado,
      responsable_id: m.responsable_id,
      responsable_nombre: perfilesMap.get(m.responsable_id) || '—',
      responder_antes_de: m.responder_antes_de,
      created_at: m.created_at,
    }
  })

  const activas = multas.filter((m) => !['aplicada', 'perdonada', 'cancelada'].includes(m.estado))
  const aplicadas = multas.filter((m) => m.estado === 'aplicada')
  const historicas = multas.filter((m) => ['perdonada', 'cancelada'].includes(m.estado))

  // Balance: por cada multa aplicada, suma al responsable
  const balanceMap = new Map<string, BalancePorPersona>()
  for (const p of perfiles ?? []) {
    balanceMap.set(p.id, {
      profile_id: p.id,
      nombre: p.nombre,
      multas_aplicadas_mxn: 0,
      multas_aplicadas_usd: 0,
    })
  }
  for (const m of aplicadas) {
    const b = balanceMap.get(m.responsable_id)
    if (!b) continue
    if (m.moneda === 'USD') b.multas_aplicadas_usd += m.monto_final ?? 0
    else b.multas_aplicadas_mxn += m.monto_final ?? 0
  }

  const balance = Array.from(balanceMap.values())

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black heading-gradient">Multas</h1>
        <span className="chip">{activas.length} activas</span>
      </div>

      {/* Balance */}
      <section className="card-glow p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-cyan-400" />
          <span className="label-caps">Balance acumulado</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {balance.map((b) => (
            <div key={b.profile_id} className="card p-3 space-y-1">
              <p className="text-xs text-zinc-500">{b.nombre}</p>
              <p className="text-lg font-black tabular-nums text-rose-400">
                {formatMoney(b.multas_aplicadas_mxn, 'MXN')}
              </p>
              {b.multas_aplicadas_usd > 0 && (
                <p className="text-xs text-rose-400/80 tabular-nums">
                  + {formatMoney(b.multas_aplicadas_usd, 'USD')}
                </p>
              )}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-zinc-500">
          Suma de multas aplicadas por persona. Las multas en disputa o sin resolver no cuentan aún.
        </p>
      </section>

      {/* Activas */}
      {activas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-amber-400 px-1">
            <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
            Por resolver ({activas.length})
          </h2>
          <div className="space-y-2">
            {activas.map((m) => (
              <MultaCard key={m.id} multa={m} currentUserId={user.id} />
            ))}
          </div>
        </section>
      )}

      {/* Aplicadas */}
      {aplicadas.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-400 px-1">
            Aplicadas ({aplicadas.length})
          </h2>
          <div className="space-y-2">
            {aplicadas.slice(0, 10).map((m) => (
              <MultaCard key={m.id} multa={m} currentUserId={user.id} />
            ))}
          </div>
        </section>
      )}

      {/* Históricas (perdonadas/canceladas) */}
      {historicas.length > 0 && (
        <section className="space-y-2 opacity-60">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 px-1">
            Histórico
          </h2>
          <div className="space-y-2">
            {historicas.slice(0, 5).map((m) => (
              <MultaCard key={m.id} multa={m} currentUserId={user.id} />
            ))}
          </div>
        </section>
      )}

      {multas.length === 0 && (
        <div className="card border-dashed p-10 text-center">
          <p className="text-sm text-zinc-500">
            Sin multas. Las multas se crean automáticamente cuando una tarea con multa configurada se vence.
          </p>
        </div>
      )}
    </div>
  )
}
