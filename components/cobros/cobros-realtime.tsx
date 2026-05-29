'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/** Refresca la página al instante cuando cambia un cobro (ej. se paga). */
export function CobrosRealtime() {
  const router = useRouter()
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('cobros-stripe-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cobros_stripe' }, () => router.refresh())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [router])
  return null
}
