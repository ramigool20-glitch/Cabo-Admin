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
import { NurseBottomNav } from '@/components/clinica/nurse-bottom-nav'
import { MpAutoSync } from '@/components/mp/auto-sync'

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

  // ENFERMERA: experiencia propia — dashboard, menú inferior, sin acceso al resto
  if (esEnfermera) {
    const primerNombre = nombre.split(' ')[0]
    return (
      <div className="min-h-screen flex flex-col bg-[var(--bg-base)]">
        <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-gradient-to-r from-emerald-500/10 via-cyan-500/5 to-transparent backdrop-blur-lg">
          <div className="px-4 py-3 flex items-center justify-between max-w-3xl mx-auto">
            <div className="leading-tight">
              <p className="text-base font-black heading-gradient">Hola, {primerNombre} 👋</p>
              <p className="text-[11px] text-zinc-400 flex items-center gap-1">🏥 Cabo Walk-in Clinic</p>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500/20 border border-cyan-500/40 text-sm font-black text-cyan-300">
              {primerNombre.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <EnfermeraGuard />
        <PullToRefresh>
          <main className="flex-1 pb-20">{children}</main>
        </PullToRefresh>
        <Suspense fallback={null}>
          <NurseBottomNav />
        </Suspense>
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
      <MpAutoSync />
      <Toaster />
      <Suspense fallback={null}>
        <ToastFlash />
      </Suspense>
    </div>
  )
}
