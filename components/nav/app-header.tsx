import { logoutAction } from '@/app/(auth)/login/actions'
import { LogOut } from 'lucide-react'

export function AppHeader({ nombre }: { nombre: string }) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur px-4 h-14"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-2.5">
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white text-sm font-bold">
          CA
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Cabo Admin</p>
          <p className="text-[11px] text-zinc-500">Hola, {nombre}</p>
        </div>
      </div>

      <form action={logoutAction}>
        <button
          type="submit"
          aria-label="Cerrar sesión"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </form>
    </header>
  )
}
