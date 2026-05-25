/**
 * Actualiza email y password de Sergio.
 * Corre: npx tsx scripts/update-sergio.ts
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const NUEVO_EMAIL = 'checo010625@gmail.com'
const NUEVO_PASSWORD = 'dimelobaby123'

async function main() {
  // Buscar el profile de Sergio
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, nombre')
    .eq('nombre', 'Sergio')
    .single()

  if (!profile) {
    console.error('No encontré profile de Sergio')
    process.exit(1)
  }

  console.log(`→ Sergio encontrado (id: ${profile.id})`)

  const { error } = await supabase.auth.admin.updateUserById(profile.id, {
    email: NUEVO_EMAIL,
    password: NUEVO_PASSWORD,
    email_confirm: true,
  })

  if (error) {
    console.error('✗ Error actualizando:', error.message)
    process.exit(1)
  }

  console.log(`✅ Sergio actualizado:`)
  console.log(`   Email: ${NUEVO_EMAIL}`)
  console.log(`   Password: ${NUEVO_PASSWORD}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
