import Link from 'next/link'
import {
  Receipt,
  AlertTriangle,
  Calendar,
  Users,
  Sparkles,
  Settings,
  ChevronRight,
} from 'lucide-react'

const links = [
  { href: '/transacciones', label: 'Transacciones', desc: 'Historial filtrable',                  icon: Receipt,       color: 'text-purple-600 bg-purple-50 dark:bg-purple-950' },
  { href: '/multas',        label: 'Multas',        desc: 'Balance entre socios',                 icon: AlertTriangle, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950' },
  { href: '/recurrentes',   label: 'Gastos Fijos',  desc: 'Rentas, sueldos, servicios',           icon: Calendar,      color: 'text-blue-600 bg-blue-50 dark:bg-blue-950' },
  { href: '/nomina',        label: 'Nómina',        desc: 'Empleados y comisiones',               icon: Users,         color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950' },
  { href: '/auditor',       label: 'Auditor IA',    desc: 'Te empuja a capturar',                 icon: Sparkles,      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950' },
  { href: '/config',        label: 'Configuración', desc: 'Negocios, cuentas, %',                 icon: Settings,      color: 'text-zinc-600 bg-[var(--bg-input)] border border-[var(--border-subtle)]' },
]

export default function MasPage() {
  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Más</h1>
        <p className="text-sm text-zinc-400">Secciones adicionales.</p>
      </header>

      <ul className="space-y-2">
        {links.map(({ href, label, desc, icon: Icon, color }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 leading-tight">
                <p className="font-medium">{label}</p>
                <p className="text-xs text-zinc-500">{desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
