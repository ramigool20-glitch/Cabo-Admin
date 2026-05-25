import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enviarPushAProfiles } from '@/lib/push/server'

export const runtime = 'nodejs'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const result = await enviarPushAProfiles([user.id], {
    title: '🎉 Cabo Admin',
    body: 'Si ves esto, las notificaciones funcionan.',
    url: '/dashboard',
    tag: 'test',
  })

  return NextResponse.json({ ok: true, ...result })
}
