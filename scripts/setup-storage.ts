/**
 * Crea buckets privados para recibos, audios, comprobantes, evidencias.
 * Idempotente: si ya existen, no falla.
 * Corre: npx tsx scripts/setup-storage.ts
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const BUCKETS = [
  { name: 'recibos',      allowedMimeTypes: ['image/*'],         fileSizeLimit: 10 * 1024 * 1024 },
  { name: 'audios',       allowedMimeTypes: ['audio/*'],         fileSizeLimit: 25 * 1024 * 1024 },
  { name: 'comprobantes', allowedMimeTypes: ['image/*', 'application/pdf'], fileSizeLimit: 10 * 1024 * 1024 },
  { name: 'evidencias',   allowedMimeTypes: ['image/*'],         fileSizeLimit: 10 * 1024 * 1024 },
  { name: 'productos',    allowedMimeTypes: ['image/*'],         fileSizeLimit: 5 * 1024 * 1024 },
]

async function main() {
  for (const b of BUCKETS) {
    const { data: existing } = await supabase.storage.getBucket(b.name)
    if (existing) {
      console.log(`✓ Bucket "${b.name}" ya existe`)
      continue
    }
    const { error } = await supabase.storage.createBucket(b.name, {
      public: false,
      fileSizeLimit: b.fileSizeLimit,
      allowedMimeTypes: b.allowedMimeTypes,
    })
    if (error) {
      console.error(`✗ Error creando "${b.name}":`, error.message)
    } else {
      console.log(`✓ Bucket "${b.name}" creado`)
    }
  }
  console.log('\n✅ Storage listo.\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
