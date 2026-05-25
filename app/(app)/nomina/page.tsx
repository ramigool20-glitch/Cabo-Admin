import { Users } from 'lucide-react'
import { PagePlaceholder } from '@/components/ui/page-placeholder'

export default function NominaPage() {
  return (
    <PagePlaceholder
      icon={Users}
      titulo="Nómina"
      descripcion="Empleados, sueldos y comisiones por negocio."
      fase="Fase 5"
    />
  )
}
