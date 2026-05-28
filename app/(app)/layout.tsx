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
import { EnfermeraGuard } from '@/components/nav/enfermera-guard'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('nombre, role_id')
    .eq('id', user.id)
    .single()

  const nombre = profile?.nombre ?? user.email?.split('@')[0] ?? 'Usuario'

  // Consulta directa al rol (robusto, sin depender del embed de PostgREST)
  let rol: string | null = null
  if (profile?.role_id) {
    const { data: roleRow } = await admin
      .from('roles')
      .select('nombre')
      .eq('id', profile.role_id)
      .single()
    rol = roleRow?.nombre ?? null
  }
  const esEnfermera = rol === 'enfermera'

  // ENFERMERA: vista limitada — solo Clínica, sin menú completo ni FAB
  if (esEnfermera) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--bg-base)]">
        <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]/90 backdrop-blur">
          <div className="px-4 h-14 flex items-center justify-between max-w-3xl mx-auto">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏥</span>
              <span className="font-black heading-gradient">Cabo Walk-in Clinic</span>
            </div>
            <span className="text-xs text-zinc-400">{nombre}</span>
          </div>
        </header>
        <EnfermeraGuard />
        <PullToRefresh>
          <main className="flex-1">{children}</main>
        </PullToRefresh>
        <Toaster />
        <Suspense fallback={null}>
          <ToastFlash />
        </Suspense>
      </div>
    )
  }

  // ADMIN / SOCIO: app completa
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
