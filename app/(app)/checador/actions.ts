'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { enviarPushAProfiles } from '@/lib/push/server'
import { logError } from '@/lib/logger/server'

export type ActionState = { ok?: boolean; error?: string; retardo?: boolean; multa?: boolean; minutos?: number; checada_id?: string }

const ChecadaSchema = z.object({
  tipo: z.enum(['entrada', 'salida']),
  biometrico_verificado: z.boolean().optional(),
  notas: z.string().max(500).nullable().optional(),
  foto_base64: z.string().optional().nullable(),  // dataURL del JPEG
})

export async function crearChecada(input: z.infer<typeof ChecadaSchema>): Promise<ActionState> {
  const parsed = ChecadaSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const admin = createAdminClient()

  // 1. Profile + nombre
  const { data: prof } = await admin
    .from('profiles')
    .select('nombre')
    .eq('id', user.id)
    .single()
  const nombre = (prof?.nombre as string) ?? 'Empleado'

  // 2. Horario del empleado
  const { data: horario } = await admin
    .from('horarios_empleado')
    .select('hora_entrada, hora_salida, tolerancia_minutos, retardos_para_multa, monto_multa_mxn')
    .eq('profile_id', user.id)
    .eq('activo', true)
    .maybeSingle()

  const ahora = new Date()
  const hoyStr = ahora.toISOString().slice(0, 10)

  // 3. ¿Ya hizo esta checada hoy? (evitar duplicados)
  const inicioDia = `${hoyStr}T00:00:00.000Z`
  const finDia = `${hoyStr}T23:59:59.999Z`
  const { data: existentes } = await admin
    .from('checadas')
    .select('id, tipo')
    .eq('profile_id', user.id)
    .gte('timestamp_at', inicioDia)
    .lte('timestamp_at', finDia)
  const yaChecoEntrada = (existentes ?? []).some(c => c.tipo === 'entrada')
  const yaChecoSalida = (existentes ?? []).some(c => c.tipo === 'salida')

  if (parsed.data.tipo === 'entrada' && yaChecoEntrada) {
    return { error: 'Ya checaste tu entrada hoy' }
  }
  if (parsed.data.tipo === 'salida' && yaChecoSalida) {
    return { error: 'Ya checaste tu salida hoy' }
  }
  if (parsed.data.tipo === 'salida' && !yaChecoEntrada) {
    return { error: 'Primero debes checar tu entrada' }
  }

  // 4. Calcular retardo si aplica
  let esperadoAt: Date | null = null
  let retardoMin = 0
  let esRetardo = false
  if (horario) {
    const tiempo = parsed.data.tipo === 'entrada' ? horario.hora_entrada : horario.hora_salida
    esperadoAt = new Date(`${hoyStr}T${tiempo}:00`)
    const diffMs = ahora.getTime() - esperadoAt.getTime()
    const minutosRetraso = Math.floor(diffMs / 60000)
    if (parsed.data.tipo === 'entrada' && minutosRetraso > Number(horario.tolerancia_minutos ?? 15)) {
      retardoMin = minutosRetraso
      esRetardo = true
    }
  }

  // 5a. Subir foto (si la hay) a storage como evidencia
  let fotoPath: string | null = null
  if (parsed.data.foto_base64) {
    try {
      const base64 = parsed.data.foto_base64.replace(/^data:image\/\w+;base64,/, '')
      const buf = Buffer.from(base64, 'base64')
      const path = `${user.id}/${hoyStr}_${parsed.data.tipo}_${Date.now()}.jpg`
      const { error: stErr } = await admin.storage
        .from('evidencias')
        .upload(path, buf, { contentType: 'image/jpeg', upsert: false })
      if (!stErr) fotoPath = path
    } catch { /* silent: la checada se registra aunque la foto falle */ }
  }

  // 5b. Registrar
  const { data: nuevaChecada, error: insErr } = await admin
    .from('checadas')
    .insert({
      profile_id: user.id,
      profile_nombre: nombre,
      tipo: parsed.data.tipo,
      timestamp_at: ahora.toISOString(),
      esperado_at: esperadoAt?.toISOString() ?? null,
      retardo_minutos: retardoMin,
      es_retardo: esRetardo,
      biometrico_verificado: parsed.data.biometrico_verificado ?? false,
      foto_url: fotoPath,
      notas: parsed.data.notas ?? null,
    })
    .select('id')
    .single()
  if (insErr) {
    await logError('checador-actions/crearChecada', insErr, {
      user_id: user.id, tipo: parsed.data.tipo, nombre,
    })
    return { error: insErr.message }
  }
  const checadaId = nuevaChecada?.id as string | undefined

  // 6a. Push inmediato a admin/socio cuando un empleado (no-admin) checa.
  //    Si hay foto, el push final con análisis IA lo envía /api/ai/analizar-checada.
  //    Si NO hay foto, mandamos este como único notificador.
  if (!fotoPath) {
    try {
      const { data: profActual } = await admin
        .from('profiles').select('roles(nombre)').eq('id', user.id).single()
      const rolActual = (profActual?.roles as unknown as { nombre: string } | null)?.nombre
      // Solo notificar si el que checa NO es admin/socio (para no spam)
      if (rolActual !== 'admin' && rolActual !== 'socio') {
        const { data: admins } = await admin
          .from('profiles').select('id, roles(nombre)').eq('activo', true)
        const adminIds = (admins ?? [])
          .filter(p => {
            const r = (p.roles as unknown as { nombre: string } | null)?.nombre
            return r === 'admin' || r === 'socio'
          })
          .map(p => p.id as string)
        if (adminIds.length > 0) {
          const hora = ahora.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })
          const tipoLabel = parsed.data.tipo === 'entrada' ? '🟢 LLEGÓ' : '🔴 SE FUE'
          await enviarPushAProfiles(adminIds, {
            title: `${tipoLabel} · ${nombre}`,
            body: esRetardo ? `${hora} · ⚠ ${retardoMin} min tarde` : `${hora} · puntual ✓`,
            url: '/checador/historial',
            tag: `checada-${user.id}-${hoyStr}-${parsed.data.tipo}`,
          })
        }
      }
    } catch { /* silent */ }
  }

  // 6b. Si fue retardo, contar retardos del mes y aplicar multa si llega al límite
  let multaAplicada = false
  if (esRetardo && horario) {
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString()
    const { count } = await admin
      .from('checadas')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', user.id)
      .eq('es_retardo', true)
      .gte('timestamp_at', inicioMes)
    const retardosMes = count ?? 0
    const limite = Number(horario.retardos_para_multa ?? 3)

    if (retardosMes >= limite && retardosMes % limite === 0) {
      // Crear multa automática
      try {
        await admin.from('multas').insert({
          profile_id: user.id,
          monto_mxn: Number(horario.monto_multa_mxn ?? 100),
          concepto: `Multa automática · ${limite} retardos en el mes`,
          fecha: hoyStr,
          estado: 'pendiente',
          creado_por: user.id,
        })
        multaAplicada = true
      } catch {
        // Si tabla multas no tiene esta estructura, lo dejamos pasar
      }
    }

    // Notificar a admin/socio
    try {
      const { data: admins } = await admin
        .from('profiles')
        .select('id, roles(nombre)')
        .eq('activo', true)
      const adminIds = (admins ?? [])
        .filter(p => {
          const r = (p.roles as unknown as { nombre: string } | null)?.nombre
          return r === 'admin' || r === 'socio'
        })
        .map(p => p.id as string)

      if (adminIds.length > 0) {
        await enviarPushAProfiles(adminIds, {
          title: multaAplicada ? '🚨 Multa automática' : '⏰ Retardo registrado',
          body: multaAplicada
            ? `${nombre}: ${limite} retardos este mes → multa $${horario.monto_multa_mxn}`
            : `${nombre} llegó ${retardoMin} min tarde`,
          url: '/checador',
          tag: `retardo-${user.id}-${hoyStr}`,
        })
      }
    } catch { /* silent */ }
  }

  revalidatePath('/checador')
  return {
    ok: true,
    retardo: esRetardo,
    multa: multaAplicada,
    minutos: retardoMin,
    checada_id: checadaId,
  }
}

/** Verifica si un usuario puede hacer corte de caja según su horario.
 *  Regla: solo desde (hora_salida - 15 min). Antes de eso, bloqueado. */
export async function puedeHacerCorte(): Promise<{ permitido: boolean; mensaje?: string; minutos_faltantes?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { permitido: false, mensaje: 'No autenticado' }

  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles')
    .select('roles(nombre)')
    .eq('id', user.id)
    .single()
  const rol = (prof?.roles as unknown as { nombre: string } | null)?.nombre

  // Admin/socio siempre pueden
  if (rol === 'admin' || rol === 'socio') return { permitido: true }

  // Cajera: solo en ventana de cierre
  if (rol === 'cajera') {
    const { data: horario } = await admin
      .from('horarios_empleado')
      .select('hora_salida')
      .eq('profile_id', user.id)
      .eq('activo', true)
      .maybeSingle()
    if (!horario) return { permitido: true }  // sin horario, no bloquear

    const ahora = new Date()
    const hoyStr = ahora.toISOString().slice(0, 10)
    const salida = new Date(`${hoyStr}T${horario.hora_salida}:00`)
    // Ventana: salida - 15 min hasta salida + 2 horas
    const ventanaInicio = new Date(salida.getTime() - 15 * 60 * 1000)
    const ventanaFin = new Date(salida.getTime() + 120 * 60 * 1000)

    if (ahora < ventanaInicio) {
      const min = Math.ceil((ventanaInicio.getTime() - ahora.getTime()) / 60000)
      return {
        permitido: false,
        mensaje: `Tu corte se habilita ${ventanaInicio.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}`,
        minutos_faltantes: min,
      }
    }
    if (ahora > ventanaFin) {
      return { permitido: true, mensaje: 'Ventana ya pasó pero permitido' }
    }
  }

  return { permitido: true }
}
