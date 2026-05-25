import type { LucideIcon } from 'lucide-react'

export function PagePlaceholder({
  icon: Icon,
  titulo,
  descripcion,
  fase,
}: {
  icon: LucideIcon
  titulo: string
  descripcion: string
  fase: string
}) {
  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{descripcion}</p>
      </header>

      <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-8 flex flex-col items-center text-center gap-3">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
          <Icon className="h-6 w-6" />
        </div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-xs">
          Esta pantalla se construye en <span className="font-medium text-zinc-900 dark:text-zinc-100">{fase}</span>.
        </p>
      </div>
    </div>
  )
}
