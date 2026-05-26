'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from './toast'
import { FLASH_MESSAGES } from '@/lib/flash'

export function ToastFlash() {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const handled = useRef<string | null>(null)

  useEffect(() => {
    const ok = params.get('ok')
    const err = params.get('err')
    const key = `${pathname}?ok=${ok}&err=${err}`
    if (handled.current === key) return
    if (!ok && !err) return
    handled.current = key

    if (ok) {
      const m = FLASH_MESSAGES[ok as keyof typeof FLASH_MESSAGES]
      if (m) {
        toast(m)
      } else {
        toast.success('Listo')
      }
    } else if (err) {
      toast.error('Algo salió mal', decodeURIComponent(err))
    }

    // Limpia los params para que un refresh no re-dispare el toast
    const next = new URLSearchParams(params.toString())
    next.delete('ok')
    next.delete('err')
    const q = next.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }, [params, pathname, router])

  return null
}
