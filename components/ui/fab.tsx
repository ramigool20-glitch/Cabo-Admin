import Link from 'next/link'
import { Plus } from 'lucide-react'

export function Fab({ href, label = 'Agregar' }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="fixed right-4 bottom-6 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 hover:scale-105 active:scale-95 text-white shadow-lg shadow-cyan-500/40 transition-transform"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}
    >
      <Plus className="h-7 w-7" strokeWidth={2.5} />
    </Link>
  )
}
