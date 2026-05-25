import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ChatClient } from '@/components/chat/chat-client'

export default async function ChatPage() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const [{ data: negocios }, { data: cuentas }, { data: perfiles }] = await Promise.all([
    supabase.from('negocios').select('id, nombre, tipo').eq('activo', true).order('nombre'),
    supabase.from('cuentas').select('id, nombre, moneda, tipo').eq('activo', true).order('nombre'),
    admin.from('profiles').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  return (
    <div className="flex flex-col max-w-3xl mx-auto w-full">
      <header className="px-4 pt-5 pb-3 space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black heading-gradient">Captura con IA</h1>
          <span className="chip chip-green">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Activo
          </span>
        </div>
        <p className="text-sm text-zinc-400">
          Texto, voz, foto o pregunta lo que quieras. Captura transacciones, gastos fijos o consulta datos.
        </p>
      </header>

      <ChatClient
        negocios={(negocios ?? []).map((n) => ({ ...n, tipo: n.tipo as string }))}
        cuentas={(cuentas ?? []).map((c) => ({
          ...c,
          moneda: c.moneda as 'MXN' | 'USD',
          tipo: c.tipo as string | null,
        }))}
        perfiles={perfiles ?? []}
      />
    </div>
  )
}
