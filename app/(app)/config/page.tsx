import { Settings } from 'lucide-react'
import { PagePlaceholder } from '@/components/ui/page-placeholder'

export default function ConfigPage() {
  return (
    <PagePlaceholder
      icon={Settings}
      titulo="Configuración"
      descripcion="Negocios, cuentas, % participación, notificaciones."
      fase="Fase 5 y 6"
    />
  )
}
