import { CheckSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TareaRow, type TareaListItem } from '@/components/tareas/tarea-row'
import { Fab } from '@/components/ui/fab'

export default async function TareasPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const [{ data: tareas }, { data: perfiles }, { data: negocios }] = await Promise.all([
    supabase
      .from('tareas')
      .select('id, titulo, descripcion, fecha_limite, prioridad, estado, asignada_a, multa_monto, moneda_multa, categoria, negocio_id')
      .order('fecha_limite', { ascending: true })
      .limit(100),
    admin.from('profiles').select('id, nombre'),
    supabase.from('negocios').select('id, nombre').eq('activo', true),
  ])

  const perfilesMap = new Map((perfiles ?? []).map((p) => [p.id, p.nombre]))
  const negociosMap = new Map((negocios ?? []).map((n) => [n.id, n.nombre]))

  const items: TareaListItem[] = (tareas ?? []).map((t) => ({
    id: t.id,
    titulo: t.titulo,
    descripcion: t.descripcion,
    fecha_limite: t.fecha_limite,
    prioridad: t.prioridad as 'alta' | 'media' | 'baja',
    estado: t.estado as 'pendiente' | 'en_progreso' | 'completada' | 'vencida',
    asignada_a_nombres: (t.asignada_a ?? []).map((id: string) => perfilesMap.get(id) || '—'),
    multa_monto: t.multa_monto ? Number(t.multa_monto) : null,
    moneda_multa: (t.moneda_multa as 'MXN' | 'USD') || 'MXN',
    negocio_nombre: t.negocio_id ? negociosMap.get(t.negocio_id) || null : null,
    categoria: t.categoria,
  }))

  // Agrupar por estado
  const activas = items.filter((t) => t.estado === 'pendiente' || t.estado === 'en_progreso')
  const vencidas = items.filter((t) => t.estado === 'vencida')
  const completadas = items.filter((t) => t.estado === 'completada').slice(0, 20)

  return (
    <div className="px-4 pt-5 pb-24 space-y-5 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black heading-gradient">Tareas</h1>
        <span className="chip">{activas.length + vencidas.length} activas</span>
      </div>

      {activas.length === 0 && vencidas.length === 0 && completadas.length === 0 ? (
        <div className="card border-dashed p-10 text-center space-y-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
            <CheckSquare className="h-6 w-6" />
          </div>
          <p className="text-sm text-zinc-400">
            Sin tareas. Toca <strong>+</strong> para asignar la primera.
          </p>
        </div>
      ) : (
        <>
          {vencidas.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-rose-400 px-1">
                Vencidas ({vencidas.length})
              </h2>
              <ul className="space-y-2">
                {vencidas.map((t) => <TareaRow key={t.id} tarea={t} />)}
              </ul>
            </section>
          )}

          {activas.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400 px-1">
                Activas ({activas.length})
              </h2>
              <ul className="space-y-2">
                {activas.map((t) => <TareaRow key={t.id} tarea={t} />)}
              </ul>
            </section>
          )}

          {completadas.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-500 px-1">
                Completadas recientes ({completadas.length})
              </h2>
              <ul className="space-y-2 opacity-70">
                {completadas.map((t) => <TareaRow key={t.id} tarea={t} />)}
              </ul>
            </section>
          )}
        </>
      )}

      <Fab href="/tareas/nueva" label="Nueva tarea" />
    </div>
  )
}
