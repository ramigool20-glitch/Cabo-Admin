import { Sparkles, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AuditorClient } from '@/components/auditor/auditor-client'

const PRIORIDAD_CHIP = {
  alta: 'chip-red',
  media: 'chip-yellow',
  baja: 'chip-cyan',
}

export default async function AuditorPage() {
  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [{ data: pendientes }, { data: perfil }] = await Promise.all([
    admin
      .from('auditor_pendientes')
      .select('id, pregunta, prioridad, contexto, dirigida_a, created_at')
      .eq('estado', 'abierta')
      .order('created_at', { ascending: false })
      .limit(10),
    admin.from('profiles').select('nombre').eq('id', user.id).single(),
  ])

  const nombre = perfil?.nombre ?? 'colega'
  const bienvenida = `Hola ${nombre}. Soy tu auditor. Estoy aquí para asegurarme de que tu base de datos esté completa. ¿Empezamos? Por ejemplo: ¿cuánto pagas de luz, agua o internet al mes y a quién?`

  return (
    <div className="flex flex-col max-w-3xl mx-auto w-full">
      <header className="px-4 pt-5 pb-3 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black heading-gradient">Auditor IA</h1>
          <span className="chip chip-green">
            <Sparkles className="h-3 w-3" />
            Activo
          </span>
        </div>
        <p className="text-sm text-zinc-400">
          Te pregunta lo que falta para que tus datos estén completos.
        </p>
      </header>

      {/* Pendientes destacados */}
      {pendientes && pendientes.length > 0 && (
        <div className="px-4 pb-2 space-y-2">
          <p className="label-caps">📌 Pendientes ({pendientes.length})</p>
          <div className="space-y-1.5">
            {pendientes.map((p) => (
              <div key={p.id} className="card p-3 space-y-1">
                <div className="flex items-start gap-2">
                  <span className={`chip ${PRIORIDAD_CHIP[p.prioridad as keyof typeof PRIORIDAD_CHIP]} text-[9px] h-5 px-2 shrink-0 mt-0.5`}>
                    {p.prioridad}
                  </span>
                  <p className="text-sm text-zinc-200 flex-1">{p.pregunta}</p>
                </div>
                {p.contexto && (
                  <p className="text-xs text-zinc-500 pl-12">{p.contexto}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <AuditorClient bienvenidaInicial={bienvenida} />
    </div>
  )
}
