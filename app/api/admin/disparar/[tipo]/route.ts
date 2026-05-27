import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Dispara manualmente el handler de un cron — para que un socio autenticado
 * pueda forzar el envío de notificaciones desde la app si Vercel cron falló o se atrasó.
 *
 * Requiere sesión activa (no usa CRON_SECRET). Solo socios pueden disparar.
 */
const CRONS_PERMITIDOS = [
  'saludo-manana',
  'check-tarde',
  'cierre-noche',
  'tareas-vencimiento',
  'notificaciones',
  'programar-notificaciones',
  'auditor',
  'recurrentes',
  'fx-rate',
] as const

type CronTipo = typeof CRONS_PERMITIDOS[number]

export async function POST(
  req: Request,
  ctx: { params: Promise<{ tipo: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { tipo } = await ctx.params
  if (!CRONS_PERMITIDOS.includes(tipo as CronTipo)) {
    return NextResponse.json({ error: `Cron desconocido: ${tipo}` }, { status: 400 })
  }

  // Reconstruimos la URL del cron con el secreto correcto para que la lógica
  // ya autenticada del handler corra tal cual.
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host')
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado en env' }, { status: 500 })
  }

  const url = `${proto}://${host}/api/cron/${tipo}`
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    })
    const data = await res.json().catch(() => ({}))
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      tipo,
      disparado_por: user.email ?? user.id,
      respuesta: data,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error disparando cron' },
      { status: 500 }
    )
  }
}
