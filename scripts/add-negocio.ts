/**
 * Agrega o actualiza un negocio reutilizando un slot "Página N" desactivado.
 * Corre: npx tsx scripts/add-negocio.ts
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

// Configura aquí el nuevo negocio
const NUEVO = {
  nombre: 'Pharmacy in Cabo',
  url: 'https://pharmacyincabo.com/',
  tipo: 'pagina_digital' as const,
  moneda_principal: 'MXN' as const,
  slot_libre: 'Página 6', // qué slot reutilizar
}

async function main() {
  // 1) Verificar que existe columna url
  const { error: colCheck } = await supabase.from('negocios').select('url').limit(1)
  if (colCheck) {
    console.error('\n❌ Falta migración 0003 (columna url).')
    console.error('Pega esto primero en el SQL Editor de Supabase:\n')
    console.error('alter table negocios add column if not exists url text;\n')
    process.exit(1)
  }

  // 2) Verificar si ya existe un negocio con este nombre
  const { data: existente } = await supabase
    .from('negocios')
    .select('id, nombre, activo')
    .eq('nombre', NUEVO.nombre)
    .maybeSingle()

  if (existente) {
    console.log(`→ Ya existe "${NUEVO.nombre}". Solo activo + url.`)
    const { error } = await supabase
      .from('negocios')
      .update({ activo: true, url: NUEVO.url })
      .eq('id', existente.id)
    if (error) throw error
    console.log('✅ Actualizado.')
    return
  }

  // 3) Intentar reutilizar slot libre
  const { data: slot } = await supabase
    .from('negocios')
    .select('id, nombre')
    .eq('nombre', NUEVO.slot_libre)
    .eq('activo', false)
    .maybeSingle()

  if (slot) {
    console.log(`→ Reutilizando slot "${slot.nombre}".`)
    const { error } = await supabase
      .from('negocios')
      .update({
        nombre: NUEVO.nombre,
        url: NUEVO.url,
        tipo: NUEVO.tipo,
        moneda_principal: NUEVO.moneda_principal,
        activo: true,
      })
      .eq('id', slot.id)
    if (error) throw error
    console.log(`✅ Slot ${slot.nombre} → "${NUEVO.nombre}"`)
    return
  }

  // 4) Insertar nuevo si no hay slots libres
  console.log('→ No hay slots libres. Insertando nuevo.')
  const { error } = await supabase.from('negocios').insert({
    nombre: NUEVO.nombre,
    url: NUEVO.url,
    tipo: NUEVO.tipo,
    moneda_principal: NUEVO.moneda_principal,
    activo: true,
  })
  if (error) throw error
  console.log(`✅ Insertado.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
