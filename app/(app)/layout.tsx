import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppHeader } from '@/components/nav/app-header'
import { BottomNav } from '@/components/nav/bottom-nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Cargamos el profile con admin client (evita ping-pong con RLS antes del primer login completo).
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('nombre')
    .eq('id', user.id)
    .single()

  const nombre = profile?.nombre ?? user.email?.split('@')[0] ?? 'Usuario'

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <AppHeader nombre={nombre} />
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  )
}
