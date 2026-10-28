import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isActiveOwner } from './owner'

// Cada Server Action comprueba por sí misma el acceso. Un layout o el proxy
// no bastan: una acción puede invocarse desde otra ruta pública.
export async function requireOwner() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('No autenticado')
  const { data: profile, error } = await createAdminClient()
    .from('profiles').select('activo').eq('id', user.id).single()
  if (error || !isActiveOwner(user, profile)) throw new Error('Acceso no autorizado')
  return user
}
