/**
 * Siembra plantillas de gastos fijos típicos para que el usuario solo tenga que ajustar montos.
 * Corre: npx tsx scripts/seed-gastos-tipicos.ts
 *
 * IDEMPOTENTE: si ya existen con el mismo nombre, no duplica.
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

// Buscar el negocio General y el negocio Farmacia local
async function findNegocio(nombre: string): Promise<string | null> {
  const { data } = await supabase
    .from('negocios')
    .select('id')
    .ilike('nombre', `%${nombre}%`)
    .eq('activo', true)
    .maybeSingle()
  return data?.id ?? null
}

const PLANTILLAS = [
  // Gastos del local físico (farmacia)
  { nombre: 'Renta local farmacia',  categoria: 'renta',     frecuencia: 'mensual', dia_del_mes: 1,  monto: 25000, negocio_buscar: 'Cvu Pharmacy local' },
  { nombre: 'Luz farmacia (CFE)',    categoria: 'servicios', frecuencia: 'mensual', dia_del_mes: 15, monto: 0,     negocio_buscar: 'Cvu Pharmacy local' },
  { nombre: 'Internet farmacia',     categoria: 'servicios', frecuencia: 'mensual', dia_del_mes: 10, monto: 0,     negocio_buscar: 'Cvu Pharmacy local' },
  { nombre: 'Agua farmacia',         categoria: 'servicios', frecuencia: 'mensual', dia_del_mes: 20, monto: 0,     negocio_buscar: 'Cvu Pharmacy local' },

  // Gastos compartidos (general)
  { nombre: 'Comida personal',       categoria: 'comida',    frecuencia: 'semanal', dia_del_mes: null, monto: 0,   negocio_buscar: 'General' },
  { nombre: 'Limpieza oficina',      categoria: 'servicios', frecuencia: 'quincenal', dia_del_mes: null, monto: 0, negocio_buscar: 'General' },
  { nombre: 'Contador',              categoria: 'servicios', frecuencia: 'mensual', dia_del_mes: 28, monto: 0,     negocio_buscar: 'General' },

  // Suscripciones / herramientas
  { nombre: 'Hosting webs',          categoria: 'servicios', frecuencia: 'mensual', dia_del_mes: 5,  monto: 0,     negocio_buscar: 'General' },
  { nombre: 'Suscripción Meta Ads',  categoria: 'ads',       frecuencia: 'mensual', dia_del_mes: 1,  monto: 0,     negocio_buscar: 'General' },
]

async function main() {
  for (const p of PLANTILLAS) {
    // Skip si ya existe con ese nombre
    const { data: exist } = await supabase
      .from('gastos_recurrentes')
      .select('id')
      .eq('nombre', p.nombre)
      .maybeSingle()
    if (exist) {
      console.log(`  ↷ "${p.nombre}" ya existe`)
      continue
    }

    const negocio_id = await findNegocio(p.negocio_buscar)
    const ahora = new Date()
    const año = ahora.getFullYear()
    const mes = ahora.getMonth()
    let proximo = ''
    if (p.dia_del_mes) {
      const d = ahora.getDate() >= p.dia_del_mes
        ? new Date(año, mes + 1, p.dia_del_mes)
        : new Date(año, mes, p.dia_del_mes)
      proximo = d.toISOString().slice(0, 10)
    } else {
      const d = new Date(año, mes, ahora.getDate() + 7)
      proximo = d.toISOString().slice(0, 10)
    }

    const { error } = await supabase.from('gastos_recurrentes').insert({
      nombre: p.nombre,
      monto: p.monto,
      moneda: 'MXN',
      frecuencia: p.frecuencia,
      dia_del_mes: p.dia_del_mes,
      proximo_pago: proximo,
      categoria: p.categoria,
      negocio_id,
      activo: p.monto > 0, // solo activa si ya tiene monto definido
      notas: p.monto === 0 ? '⚠ Plantilla — actualiza el monto antes de usar' : null,
    })

    if (error) {
      console.error(`  ✗ "${p.nombre}":`, error.message)
    } else {
      console.log(`  ✓ "${p.nombre}" sembrado (${p.monto === 0 ? 'plantilla' : 'activo'})`)
    }
  }

  console.log('\n✅ Seed completo. Las plantillas con $0 están desactivadas — actualízalas para activarlas.\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
