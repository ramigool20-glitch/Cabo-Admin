/**
 * Seed inicial de usuarios.
 * Corre: npx tsx scripts/seed-users.ts
 * Requiere .env.local con SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const USERS = [
  { nombre: 'Miguel', email: 'ramigool20@gmail.com',    password: 'prueba123' },
  { nombre: 'Sergio', email: 'sergio@cabo-admin.local', password: 'prueba123' },
]

async function main() {
  // 1) Obtener role_id de 'admin'
  const { data: roleAdmin, error: roleErr } = await supabase
    .from('roles')
    .select('id')
    .eq('nombre', 'admin')
    .single()

  if (roleErr || !roleAdmin) {
    console.error('No se encontró rol admin:', roleErr)
    process.exit(1)
  }

  for (const u of USERS) {
    console.log(`\n→ Procesando ${u.nombre} (${u.email})…`)

    // 2) Buscar usuario existente
    const { data: list } = await supabase.auth.admin.listUsers()
    const existing = list?.users.find((x) => x.email === u.email)

    let userId: string

    if (existing) {
      console.log(`  ✓ Ya existe (${existing.id}). Actualizo password…`)
      const { error: updErr } = await supabase.auth.admin.updateUserById(existing.id, {
        password: u.password,
        email_confirm: true,
      })
      if (updErr) {
        console.error('  ✗ Error actualizando:', updErr.message)
        continue
      }
      userId = existing.id
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { nombre: u.nombre },
      })
      if (createErr || !created.user) {
        console.error('  ✗ Error creando:', createErr?.message)
        continue
      }
      userId = created.user.id
      console.log(`  ✓ Usuario creado (${userId})`)
    }

    // 3) Upsert profile con rol admin
    const { error: profileErr } = await supabase
      .from('profiles')
      .upsert(
        {
          id: userId,
          nombre: u.nombre,
          role_id: roleAdmin.id,
          activo: true,
        },
        { onConflict: 'id' }
      )

    if (profileErr) {
      console.error('  ✗ Error en profile:', profileErr.message)
      continue
    }
    console.log(`  ✓ Profile listo con rol admin`)
  }

  console.log('\n✅ Seed de usuarios completo.\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
