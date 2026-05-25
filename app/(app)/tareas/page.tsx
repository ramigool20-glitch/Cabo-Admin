import { CheckSquare } from 'lucide-react'
import { PagePlaceholder } from '@/components/ui/page-placeholder'

export default function TareasPage() {
  return (
    <PagePlaceholder
      icon={CheckSquare}
      titulo="Tareas"
      descripcion="Asigna tareas a Sergio con fecha límite y multa."
      fase="Fase 7"
    />
  )
}
