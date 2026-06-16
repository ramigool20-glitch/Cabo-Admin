/**
 * Helpers para el sistema "híbrido" cuando llega un cobro MP que requiere
 * intervención humana: crea una pregunta en `auditor_pendientes` y manda un
 * push con la URL del flujo "1-tap" para categorizar rápido desde el iPhone.
 *
 * Tres niveles:
 *   - 'alta'   → la sugerencia se aplicó. Push silencioso "ya quedó como X".
 *   - 'media'  → se aplicó pero conviene verificar. Push normal "¿está bien?".
 *   - 'baja'   → categoría/negocio en blanco. Push "¿de qué fue?" + pendiente.
 *
 * Cada función retorna { ok, error?, ... } para que el caller pueda loggear
 * el error real en webhook_log en lugar de silenciar con try/catch.
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

export async function crearPendienteCategorizacion(
  admin: SupabaseClient,
  tx: TxResumen,
  sug: Sugerencia | null,
  integ: IntegMP,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    // Si hay sugerencia con negocio, preguntamos para confirmar; si no, pedimos
    // que se asigne desde cero.
    const monto = formatMoney(tx.monto, tx.moneda)
    const pregunta = sug?.negocio_nombre
      ? `Cobro de ${monto} en ${integ.nombre} — ¿es de "${sug.negocio_nombre}"?`
      : `¿De qué fue el cobro de ${monto} en ${integ.nombre}?`

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

    // Prioridad: baja confianza = alta prioridad (verdaderamente sin categorizar).
    // Media/alta confianza = media prioridad (ya hay sugerencia, solo confirmar).
    const prioridad = !sug || sug.confianza === 'baja' ? 'alta' : 'media'
    const { data, error } = await admin.from('auditor_pendientes').insert({
      pregunta,
      contexto,
      prioridad,
      estado: 'abierta',
    }).select('id').single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, id: data?.id as string }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'pendiente error' }
  }
}

export async function enviarPushCategorizacion(
  admin: SupabaseClient,
  tx: TxResumen,
  sug: Sugerencia | null,
  integ: IntegMP,
  urgencia: Urgencia,
): Promise<{ ok: boolean; enviados?: number; fallidos?: number; total?: number; error?: string }> {
  try {
    const ids = await destinatarios(admin)
    if (ids.length === 0) return { ok: true, enviados: 0, fallidos: 0, total: 0 }

    const monto = formatMoney(tx.monto, tx.moneda)

    let title: string
    let body: string

    if (urgencia === 'baja') {
      title = `💰 +${monto} en ${integ.nombre}`
      body = sug?.negocio_nombre
        ? `Lo metí como "${sug.negocio_nombre}" automáticamente. Toca si quieres revisar.`
        : 'Registrado. Toca para revisar.'
    } else if (urgencia === 'media') {
      title = `💰 +${monto} en ${integ.nombre}`
      body = sug?.negocio_nombre
        ? `¿Es de "${sug.negocio_nombre}"? Toca para confirmar o cambiar.`
        : '¿De qué fue? Toca para asignar.'
    } else {
      title = `❓ +${monto} en ${integ.nombre} sin categorizar`
      body = '¿De qué negocio fue? Toca para asignar de 1 tap.'
    }

    const r = await enviarPushAProfiles(ids, {
      title,
      body,
      url: `/transacciones/categorizar/${tx.id}`,
      tag: `mp-cat-${tx.id}`,
      data: { tx_id: tx.id, integ_id: integ.id, urgencia },
    })

    return {
      ok: true,
      enviados: r.enviados,
      fallidos: r.fallidos,
      total: r.total,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'push error' }
  }
}
