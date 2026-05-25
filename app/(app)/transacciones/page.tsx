import { Receipt } from 'lucide-react'
import { PagePlaceholder } from '@/components/ui/page-placeholder'

export default function TransaccionesPage() {
  return (
    <PagePlaceholder
      icon={Receipt}
      titulo="Transacciones"
      descripcion="Historial filtrable y editable."
      fase="Fase 2"
    />
  )
}
