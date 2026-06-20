/**
 * Logger central para producción.
 *
 * Guarda errores en tabla error_log + manda push a admin si es crítico.
 * NO bloquea el flow original — si el logger mismo falla, lo cacha en silencio.
 *
 * Uso:
 *   import { logError, logWarn, logInfo } from '@/lib/logger/server'
 *
 *   try {
 *     await operacionRiesgosa()
 *   } catch (e) {
 *     await logError('venta-actions/crear', e, { user_id, monto, items })
 *   }
 */

import { createAdminClient } from '@/lib/supabase/admin'

type Level = 'info' | 'warn' | 'error' | 'fatal'

type LogContext = Record<string, unknown> | undefined

async function log(
  level: Level,
  source: string,
  messageOrError: string | Error | unknown,
  context?: LogContext,
): Promise<void> {
  try {
    let message: string
    let stack: string | null = null

    if (messageOrError instanceof Error) {
      message = messageOrError.message
      stack = messageOrError.stack ?? null
    } else if (typeof messageOrError === 'string') {
      message = messageOrError
    } else {
      message = JSON.stringify(messageOrError).slice(0, 1000)
    }

    const admin = createAdminClient()
    await admin.from('error_log').insert({
      level,
      source,
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 5000) ?? null,
      context: context ?? null,
      user_id: typeof context?.user_id === 'string' ? context.user_id : null,
      notificado_push: false,
    })

    // Si es FATAL, mandamos push a admin/socio (best-effort)
    if (level === 'fatal' || level === 'error') {
      try {
        const { enviarPushAProfiles } = await import('@/lib/push/server')
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

        if (adminIds.length > 0 && level === 'fatal') {
          // Solo FATAL dispara push (error no satura)
          await enviarPushAProfiles(adminIds, {
            title: `🚨 Error fatal · ${source}`,
            body: message.slice(0, 150),
            url: '/config/errores',
            tag: `error-${source}-${Date.now()}`,
          })
        }
      } catch { /* push falló, no es bloqueante */ }
    }
  } catch {
    // El logger mismo no debe romper la app. Solo console.
    console.error(`[logger fallback] ${level} ${source}:`, messageOrError)
  }
}

export const logError = (source: string, error: unknown, context?: LogContext) =>
  log('error', source, error, context)

export const logFatal = (source: string, error: unknown, context?: LogContext) =>
  log('fatal', source, error, context)

export const logWarn = (source: string, msg: string | Error, context?: LogContext) =>
  log('warn', source, msg, context)

export const logInfo = (source: string, msg: string, context?: LogContext) =>
  log('info', source, msg, context)
