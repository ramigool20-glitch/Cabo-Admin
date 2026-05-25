import { Calendar } from 'lucide-react'
import { PagePlaceholder } from '@/components/ui/page-placeholder'

export default function RecurrentesPage() {
  return (
    <PagePlaceholder
      icon={Calendar}
      titulo="Gastos recurrentes"
      descripcion="Rentas, sueldos, servicios. Pago automatizado."
      fase="Fase 5"
    />
  )
}
