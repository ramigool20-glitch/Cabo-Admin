import { createClient } from '@supabase/supabase-js'

// Cliente con service_role: solo usar en endpoints/cron del servidor.
// NUNCA importar desde Client Components.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
