// Carga los productos del TSV inicial a inventario_productos.
// Idempotente: usa upsert por codigo_barras si lo hay, o por nombre si no.
// Uso: node scripts/cargar-inventario.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const [k, ...rest] = l.split('='); return [k.trim(), rest.join('=').trim().replace(/^['"]|['"]$/g, '')] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// Cvu Pharmacy local (de mi análisis forense)
const CVU_PHARMACY_LOCAL_ID = '469211e8-b4bc-4bf3-9442-5c8cdf728584'

const tsv = readFileSync(new URL('./inventario/farmacia_inicial.tsv', import.meta.url), 'utf8')
const lines = tsv.split('\n').filter(l => l.trim().length > 0)
const header = lines.shift() // descartar header
console.log(`Header: ${header}`)
console.log(`Líneas: ${lines.length}`)

let creados = 0, actualizados = 0, errores = 0
let batch = []
const BATCH_SIZE = 50

async function flushBatch() {
  if (batch.length === 0) return
  // Para conservar la lógica de "no duplicar", primero buscamos los códigos que ya existen
  const codigos = batch.filter(p => p.codigo_barras).map(p => p.codigo_barras)
  const { data: existentes } = await supabase
    .from('inventario_productos')
    .select('id, codigo_barras, nombre')
    .or(`codigo_barras.in.(${codigos.map(c => `"${c}"`).join(',') || '"_"'})`)
  const idxByCodigo = new Map((existentes ?? []).map(e => [e.codigo_barras, e.id]))

  for (const prod of batch) {
    const existeId = prod.codigo_barras ? idxByCodigo.get(prod.codigo_barras) : null

    if (existeId) {
      // Update — solo precio y stock; mantenemos categoría/notas (por si el usuario las editó)
      const { error } = await supabase
        .from('inventario_productos')
        .update({
          precio_mxn: prod.precio_mxn,
          stock: prod.stock,
        })
        .eq('id', existeId)
      if (error) { console.log('✗ UPDATE', prod.nombre, error.message); errores++ }
      else actualizados++
    } else {
      // Insert nuevo
      const { error } = await supabase
        .from('inventario_productos')
        .insert(prod)
      if (error) { console.log('✗ INSERT', prod.nombre, error.message); errores++ }
      else creados++
    }
  }
  batch = []
}

for (const line of lines) {
  // El TSV está separado por TAB
  const cols = line.split('\t')
  const nombre = cols[0]?.trim()
  const precioRaw = cols[1]?.trim()
  const stockRaw = cols[2]?.trim()
  const categoria = cols[3]?.trim() || null
  const codigo_barras = cols[4]?.trim() || null

  if (!nombre) continue

  // Precio: puede venir como "70" o "$70"
  const precio_mxn = Number(String(precioRaw).replace(/[^\d.]/g, '')) || 0
  // Stock: viene como "4 unidad" o "12" — extraer el número
  const stock = Number(String(stockRaw).replace(/[^\d]/g, '')) || 0
  // unidad
  const unidadMatch = String(stockRaw).match(/[a-zA-Záéíóú]+/)
  const unidad_stock = unidadMatch ? unidadMatch[0] : 'unidad'

  batch.push({
    nombre,
    precio_mxn,
    stock,
    unidad_stock,
    categoria,
    codigo_barras,
    negocio_id: CVU_PHARMACY_LOCAL_ID,
  })

  if (batch.length >= BATCH_SIZE) {
    await flushBatch()
    console.log(`  procesados: ${creados} creados + ${actualizados} actualizados + ${errores} errores`)
  }
}
await flushBatch()

console.log(`\nFINAL → ${creados} creados, ${actualizados} actualizados, ${errores} errores`)
