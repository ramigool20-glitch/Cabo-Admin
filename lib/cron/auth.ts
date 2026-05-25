/**
 * Verifica que la petición venga de Vercel Cron.
 * Vercel envía el header Authorization: Bearer {CRON_SECRET}.
 */
export function isAuthorizedCron(req: Request): boolean {
  const auth = req.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return auth === `Bearer ${secret}`
}
