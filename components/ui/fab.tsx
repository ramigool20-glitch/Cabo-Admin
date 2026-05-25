import Link from 'next/link'
import { Plus } from 'lucide-react'

export function Fab({ href, label = 'Agregar' }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="fixed right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-lg shadow-emerald-600/30 transition-colors"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
    >
      <Plus className="h-7 w-7" strokeWidth={2.5} />
    </Link>
  )
}
