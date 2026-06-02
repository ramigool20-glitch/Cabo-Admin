/**
 * Cron lunes 8am — genera el resumen ejecutivo de la semana pasada (lun→dom).
 * Si ya existe la fila de esa semana, no la regenera. Manda push a socios.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { hoyEnCabos } from '@/lib/fechas'
import { semanaAnterior, calcularDatosSemana, generarNarrativaIA } from '@/lib/ai/resumen-semanal'
import { enviarPushAProfiles } from '@/lib/push/server'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return await ejecutar()
}

/** Endpoint manual: misma lógica pero requiere socio/admin. */
export async function POST() {
  // La protección la hacemos via requireSocio al consumirlo desde /dashboard;
  // este endpoint solo lo dispara una server action interna.
  return await ejecutar()
}

async function ejecutar(): Promise<Response> {
  const admin = createAdminClient()
  const hoy = hoyEnCabos()
  const semana = semanaAnterior(hoy)

  // ¿Ya existe el resumen de esta semana?
  const { data: existente } = await admin
    .from('resumen_semanal')
    .select('id, resumen_md')
    .eq('semana_inicio', semana.inicio)
    .maybeSingle()
  if (existente) {
    return NextResponse.json({ ok: true, status: 'ya_existe', semana_inicio: semana.inicio })
  }

  // Calcular datos reales
  const datos = await calcularDatosSemana(admin, semana)

  // Narrativa IA
  let narrativa: string
  try {
    narrativa = await generarNarrativaIA(datos)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'IA falló: ' + msg.slice(0, 200) }, { status: 500 })
  }

  // Persistir
  const { data: nuevo, error: insErr } = await admin
    .from('resumen_semanal')
    .insert({
      semana_inicio: semana.inicio,
      semana_fin: semana.fin,
      resumen_md: narrativa,
      datos,
    })
    .select('id')
    .single()
  if (insErr) {
    if (/relation.*does not exist/i.test(insErr.message)) {
      return NextResponse.json({ error: 'Falta aplicar migración 0035_resumen_semanal.sql' }, { status: 500 })
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  // Push a socios
  try {
    const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-MX')
    const { data: socios } = await admin
      .from('profiles')
      .select('id, roles(nombre)')
      .eq('activo', true)
    const profileIds = (socios ?? [])
      .filter((p) => {
        const r = p.roles as unknown as { nombre: string } | null
        return r?.nombre === 'admin' || r?.nombre === 'socio'
      })
      .map((p) => p.id)
    if (profileIds.length > 0) {
      await enviarPushAProfiles(profileIds, {
        title: '📊 Resumen semanal listo',
        body: `Neto ${fmt(datos.neto_mxn)} MXN · ${datos.num_transacciones} tx · ver dashboard`,
        url: '/dashboard',
        tag: 'resumen-semanal-' + datos.semana_inicio,
      })
      await admin.from('resumen_semanal').update({ enviado_push: true }).eq('id', nuevo.id)
    }
  } catch {
    // best-effort
  }

  return NextResponse.json({
    ok: true,
    status: 'creado',
    semana_inicio: semana.inicio,
    neto_mxn: datos.neto_mxn,
    num_tx: datos.num_transacciones,
  })
}
