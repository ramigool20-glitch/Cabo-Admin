'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

// Rutas permitidas para el rol enfermera
const PERMITIDAS = ['/clinica', '/tareas']

export function EnfermeraGuard() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const permitida = PERMITIDAS.some((p) => pathname === p || pathname.startsWith(p + '/'))
    if (!permitida) {
      router.replace('/clinica')
    }
  }, [pathname, router])

  return null
}
