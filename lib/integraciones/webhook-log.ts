/**
 * Helper para registrar webhooks recibidos y corridas de cron en BD.
 * Nunca lanza error — el logging no debe bloquear la operación principal.
 */
import { createAdminClient } from '@/lib/supabase/admin'

export type WebhookLogEntry = {
  fuente: 'webhook_mp' | 'cron_mp_sync' | 'cron_mp_sync_one' | 'manual_sync' | 'auto_sync'
  integracion_id?: string | null
  status?: number | null
  ok?: boolean | null
  http_method?: string | null
  request_url?: string | null
  request_body?: unknown
  request_signature?: string | null
  signature_valid?: boolean | null
  payment_id?: string | null
  payment_type?: string | null
  resultado?: unknown
  error?: string | null
  duracion_ms?: number | null
}

export async function logWebhook(entry: WebhookLogEntry) {
  try {
    const admin = createAdminClient()
    await admin.from('webhook_log').insert({
      fuente: entry.fuente,
      integracion_id: entry.integracion_id ?? null,
      status: entry.status ?? null,
      ok: entry.ok ?? null,
      http_method: entry.http_method ?? null,
      request_url: entry.request_url?.slice(0, 500) ?? null,
      request_body: entry.request_body ?? null,
      request_signature: entry.request_signature?.slice(0, 200) ?? null,
      signature_valid: entry.signature_valid ?? null,
      payment_id: entry.payment_id ?? null,
      payment_type: entry.payment_type ?? null,
      resultado: entry.resultado ?? null,
      error: entry.error?.slice(0, 500) ?? null,
      duracion_ms: entry.duracion_ms ?? null,
    })
  } catch {
    // best-effort, never throws
  }
}
