import { Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AuditorClient } from '@/components/auditor/auditor-client'
import { PendientesList } from '@/components/auditor/pendientes-list'

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

  const [{ data: pendientes }, { data: perfil }] = await Promise.all([
    admin
      .from('auditor_pendientes')
      .select('id, pregunta, prioridad, contexto, created_at')
      .eq('estado', 'abierta')
      .order('created_at', { ascending: false })
      .limit(10),
    admin.from('profiles').select('nombre').eq('id', user.id).single(),
  ])

  const nombre = perfil?.nombre ?? 'colega'
  const bienvenida = `Hola ${nombre}. Soy tu auditor. Estoy aquí para asegurarme de que tu base de datos esté completa. ¿Empezamos? Por ejemplo: ¿cuánto pagas de luz, agua o internet al mes y a quién?`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendientesTyped = (pendientes ?? []) as any[]

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

      {pendientesTyped.length > 0 && (
        <div className="px-4 pb-2">
          <PendientesList pendientes={pendientesTyped} />
        </div>
      )}

      <AuditorClient bienvenidaInicial={bienvenida} />
    </div>
  )
}
