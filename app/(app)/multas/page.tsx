import { AlertTriangle } from 'lucide-react'
import { PagePlaceholder } from '@/components/ui/page-placeholder'

export default function MultasPage() {
  return (
    <PagePlaceholder
      icon={AlertTriangle}
      titulo="Multas"
      descripcion="Balance entre socios y resolución de multas."
      fase="Fase 7"
    />
  )
}
