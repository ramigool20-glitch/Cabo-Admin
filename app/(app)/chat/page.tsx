import { createClient } from '@/lib/supabase/server'
import { ChatClient } from '@/components/chat/chat-client'

export default async function ChatPage() {
  const supabase = await createClient()
  const [{ data: negocios }, { data: cuentas }] = await Promise.all([
    supabase.from('negocios').select('id, nombre, tipo').eq('activo', true).order('nombre'),
    supabase.from('cuentas').select('id, nombre, moneda, tipo').eq('activo', true).order('nombre'),
  ])

  return (
    <div className="flex flex-col">
      <header className="px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold tracking-tight">Chat</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Captura con foto, voz o texto.
        </p>
      </header>

      <ChatClient
        negocios={(negocios ?? []).map((n) => ({ ...n, tipo: n.tipo as string }))}
        cuentas={(cuentas ?? []).map((c) => ({
          ...c,
          moneda: c.moneda as 'MXN' | 'USD',
          tipo: c.tipo as string | null,
        }))}
      />
    </div>
  )
}
