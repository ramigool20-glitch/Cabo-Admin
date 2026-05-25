import { MessageCircle } from 'lucide-react'
import { PagePlaceholder } from '@/components/ui/page-placeholder'

export default function ChatPage() {
  return (
    <PagePlaceholder
      icon={MessageCircle}
      titulo="Chat"
      descripcion="Captura por foto, voz o texto con IA."
      fase="Fase 3"
    />
  )
}
