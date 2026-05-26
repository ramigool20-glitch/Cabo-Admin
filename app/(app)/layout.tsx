import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppHeader } from '@/components/nav/app-header'
import { TopTabs } from '@/components/nav/top-tabs'
import { QuickActionFab } from '@/components/ui/quick-action-fab'
import { Toaster } from '@/components/ui/toast'
import { ToastFlash } from '@/components/ui/toast-flash'
import { PullToRefresh } from '@/components/ui/pull-to-refresh'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('nombre')
    .eq('id', user.id)
    .single()

  const nombre = profile?.nombre ?? user.email?.split('@')[0] ?? 'Usuario'

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)]">
      <AppHeader nombre={nombre} />
      <TopTabs />
      <PullToRefresh>
        <main className="flex-1">{children}</main>
      </PullToRefresh>
      <QuickActionFab />
      <Toaster />
      <Suspense fallback={null}>
        <ToastFlash />
      </Suspense>
    </div>
  )
}
