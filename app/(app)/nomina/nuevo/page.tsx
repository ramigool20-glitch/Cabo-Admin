import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { EmpleadoForm } from '@/components/nomina/empleado-form'

export default function NuevoEmpleadoPage() {
  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <Link href="/nomina" className="inline-flex items-center gap-1 text-sm text-zinc-600">
        <ChevronLeft className="h-4 w-4" /> Nómina
      </Link>
      <header><h1 className="text-2xl font-bold tracking-tight">Nuevo empleado</h1></header>
      <EmpleadoForm defaults={{}} />
    </div>
  )
}
