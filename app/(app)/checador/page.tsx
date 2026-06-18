import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ChecadorClient } from '@/components/checador/checador-client'

export const dynamic = 'force-dynamic'

export default async function ChecadorPage() {
  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  let nombre = 'Empleado'
  let rol: string | null = null
  let horario: { hora_entrada: string; hora_salida: string; tolerancia_minutos: number; retardos_para_multa: number; monto_multa_mxn: number } | null = null
  let checadasHoy: Array<{ id: string; tipo: string; timestamp_at: string; retardo_minutos: number; es_retardo: boolean }> = []
  let retardosMes = 0
  let tablaPendiente = false

  if (user) {
    const { data: prof } = await admin
      .from('profiles')
      .select('nombre, roles(nombre)')
      .eq('id', user.id)
      .single()
    nombre = (prof?.nombre as string) ?? user.email?.split('@')[0] ?? 'Empleado'
    rol = ((prof?.roles as unknown as { nombre: string } | null)?.nombre) ?? null

    try {
      const { data: h } = await admin
        .from('horarios_empleado')
        .select('hora_entrada, hora_salida, tolerancia_minutos, retardos_para_multa, monto_multa_mxn')
        .eq('profile_id', user.id)
        .eq('activo', true)
        .maybeSingle()
      horario = h as never

      const hoyStr = new Date().toISOString().slice(0, 10)
      const inicioDia = `${hoyStr}T00:00:00.000Z`
      const { data: chs } = await admin
        .from('checadas')
        .select('id, tipo, timestamp_at, retardo_minutos, es_retardo')
        .eq('profile_id', user.id)
        .gte('timestamp_at', inicioDia)
        .order('timestamp_at')
      checadasHoy = (chs ?? []) as never

      const inicioMes = new Date()
      inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
      const { count } = await admin
        .from('checadas')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', user.id)
        .eq('es_retardo', true)
        .gte('timestamp_at', inicioMes.toISOString())
      retardosMes = count ?? 0
    } catch {
      tablaPendiente = true
    }
  }

  return (
    <div className="px-4 pt-4 pb-24 space-y-4 max-w-2xl mx-auto">
      <Link href={rol === 'cajera' ? '/pos' : '/dashboard'} className="inline-flex items-center gap-1 text-sm text-zinc-400">
        <ChevronLeft className="h-4 w-4" />
        Volver
      </Link>

      <ChecadorClient
        nombre={nombre}
        horario={horario}
        checadasHoy={checadasHoy}
        retardosMes={retardosMes}
        tablaPendiente={tablaPendiente}
      />
    </div>
  )
}
