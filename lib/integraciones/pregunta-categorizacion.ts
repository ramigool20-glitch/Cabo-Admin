/**
 * Helpers para el sistema "híbrido" cuando llega un cobro MP que requiere
 * intervención humana: crea una pregunta en `auditor_pendientes` y manda un
 * push con la URL del flujo "1-tap" para categorizar rápido desde el iPhone.
 *
 * Tres niveles:
 *   - 'alta'   → la sugerencia se aplicó. Push silencioso "ya quedó como X".
 *   - 'media'  → se aplicó pero conviene verificar. Push normal "¿está bien?".
 *   - 'baja'   → categoría/negocio en blanco. Push "¿de qué fue?" + pendiente.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarPushAProfiles } from '@/lib/push/server'
import { formatMoney } from '@/lib/utils'
import type { Sugerencia } from '@/lib/ai/sugerir-categorizacion'

type IntegMP = {
  id: string
  nombre: string
  cuenta_id: string | null
  negocio_default_id: string | null
}

type TxResumen = {
  id: string
  monto: number
  moneda: 'MXN' | 'USD'
  concepto: string | null
  fecha: string
}

type Urgencia = 'alta' | 'media' | 'baja'

/**
 * Encuentra los profile_ids de los socios+admins activos a quienes notificar.
 */
async function destinatarios(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin
    .from('profiles')
    .select('id, roles(nombre)')
    .eq('activo', true)
  return (data ?? [])
    .filter((p) => {
      const r = p.roles as unknown as { nombre: string } | null
      return r?.nombre === 'admin' || r?.nombre === 'socio'
    })
    .map((p) => p.id as string)
}

/**
 * Crea una fila en auditor_pendientes con referencia al tx_id en el contexto.
 * `dirigida_a` queda en null = pregunta abierta para cualquier socio/admin.
 */
export async function crearPendienteCategorizacion(
  admin: SupabaseClient,
  tx: TxResumen,
  sug: Sugerencia | null,
  integ: IntegMP,
) {
  const pregunta = sug?.confianza === 'media'
    ? `¿El cobro de ${formatMoney(tx.monto, tx.moneda)} en ${integ.nombre} es de "${sug.negocio_nombre ?? '—'}"?`
    : `¿De qué fue el cobro de ${formatMoney(tx.monto, tx.moneda)} en ${integ.nombre}?`

  const contexto = JSON.stringify({
    tipo: 'mp_categorizar',
    tx_id: tx.id,
    integracion_id: integ.id,
    sugerencia: sug
      ? {
          confianza: sug.confianza,
          fuente: sug.fuente,
          categoria: sug.categoria,
          negocio_id: sug.negocio_id,
          negocio_nombre: sug.negocio_nombre,
          ejemplos: sug.ejemplos_count,
        }
      : null,
  })

  await admin.from('auditor_pendientes').insert({
    pregunta,
    contexto,
    prioridad: sug?.confianza === 'media' ? 'media' : 'alta',
    estado: 'abierta',
  })
}

/**
 * Manda push notification a los socios+admins con link a la pantalla 1-tap.
 * El urgencia determina si vibra/suena o no.
 */
export async function enviarPushCategorizacion(
  admin: SupabaseClient,
  tx: TxResumen,
  sug: Sugerencia | null,
  integ: IntegMP,
  urgencia: Urgencia,
) {
  const ids = await destinatarios(admin)
  if (ids.length === 0) return

  const monto = formatMoney(tx.monto, tx.moneda)

  let title: string
  let body: string

  if (urgencia === 'baja') {
    // Confianza alta — ya categorizado
    title = `💰 +${monto} en ${integ.nombre}`
    body = sug?.negocio_nombre
      ? `Lo metí como "${sug.negocio_nombre}" automáticamente. Toca si quieres revisar.`
      : 'Registrado. Toca para revisar.'
  } else if (urgencia === 'media') {
    // Confianza media — verificar
    title = `💰 +${monto} en ${integ.nombre}`
    body = sug?.negocio_nombre
      ? `¿Es de "${sug.negocio_nombre}"? Toca para confirmar o cambiar.`
      : '¿De qué fue? Toca para asignar.'
  } else {
    // Confianza baja — preguntar
    title = `❓ +${monto} en ${integ.nombre} sin categorizar`
    body = '¿De qué negocio fue? Toca para asignar de 1 tap.'
  }

  await enviarPushAProfiles(ids, {
    title,
    body,
    url: `/transacciones/categorizar/${tx.id}`,
    tag: `mp-cat-${tx.id}`,
    data: { tx_id: tx.id, integ_id: integ.id, urgencia },
  })
}
