import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AuditorTabs, type Observacion, type Pendiente, type MemoriaItem } from '@/components/auditor/auditor-tabs'
import { hoyEnCabos } from '@/lib/fechas'

export default async function AuditorPage() {
  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Auto-cleanup: pendientes con más de 14 días sin tocar → 'descartada'
  const hace14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  await admin
    .from('auditor_pendientes')
    .update({ estado: 'descartada', contestada_at: new Date().toISOString() })
    .eq('estado', 'abierta')
    .lt('created_at', hace14d)

  const hoy = hoyEnCabos()
  const inicioMes = hoy.slice(0, 7) + '-01'

  const [obsRes, pendRes, memRes, perfilRes, txRes] = await Promise.all([
    admin
      .from('auditor_observaciones')
      .select('id, severidad, titulo, detalle, recomendacion, categoria, datos, estado, created_at')
      .in('estado', ['nueva', 'vista'])
      .order('created_at', { ascending: false })
      .limit(60),
    admin
      .from('auditor_pendientes')
      .select('id, pregunta, prioridad, contexto, created_at')
      .eq('estado', 'abierta')
      .order('created_at', { ascending: false })
      .limit(10),
    admin
      .from('memoria_ia')
      .select('id, tipo, contenido, importancia, created_at')
      .eq('activa', true)
      .order('importancia', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('profiles').select('nombre').eq('id', user.id).single(),
    admin.from('transacciones').select('tipo, monto, moneda, monto_mxn_equivalente').gte('fecha', inicioMes).lte('fecha', hoy),
  ])

  const observaciones = (obsRes.data ?? []) as unknown as Observacion[]
  const pendientes = (pendRes.data ?? []) as unknown as Pendiente[]
  const memoria = (memRes.data ?? []) as unknown as MemoriaItem[]
  const nombre = perfilRes.data?.nombre ?? 'colega'

  // Pulso: utilidad del mes (MXN equivalente, datos reales)
  const equiv = (t: { monto: number; moneda: string; monto_mxn_equivalente: number | null }) =>
    t.monto_mxn_equivalente != null ? Number(t.monto_mxn_equivalente) : (t.moneda === 'MXN' ? Number(t.monto) : 0)
  let ingresos = 0, gastos = 0
  for (const t of (txRes.data ?? []) as { tipo: string; monto: number; moneda: string; monto_mxn_equivalente: number | null }[]) {
    if (t.tipo === 'ingreso') ingresos += equiv(t)
    else if (t.tipo === 'gasto' || t.tipo === 'multa_interna') gastos += equiv(t)
  }
  const pulso = {
    utilidadMes: ingresos - gastos,
    graves: observaciones.filter((o) => o.severidad === 'grave').length,
    atencion: observaciones.filter((o) => o.severidad === 'atencion').length,
    preguntas: pendientes.length,
  }

  const bienvenida = `Hola ${nombre}. Soy tu Auditor IA. Veo todos tus datos en tiempo real. Pregúntame lo que sea, dame contexto para que aprenda, o dime "analiza mis gastos del mes".`

  const faltaTabla = obsRes.error && /does not exist/i.test(obsRes.error.message ?? '')

  return (
    <div className="flex flex-col max-w-3xl mx-auto w-full">
      <header className="px-4 pt-5 pb-3 space-y-1">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black heading-gradient">Auditor IA</h1>
          <span className="chip chip-green"><Sparkles className="h-3 w-3" /> Activo</span>
        </div>
        <p className="text-sm text-zinc-400">Lo que detecta de tus datos reales, sus preguntas y su memoria.</p>
      </header>

      {faltaTabla && (
        <div className="mx-4 mb-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
          Falta crear la tabla del feed. Pega la migración <strong>0030_auditor_observaciones.sql</strong> en Supabase y las observaciones empezarán a aparecer.
        </div>
      )}

      <AuditorTabs
        observaciones={observaciones}
        pendientes={pendientes}
        memoria={memoria}
        pulso={pulso}
        bienvenida={bienvenida}
      />
    </div>
  )
}
