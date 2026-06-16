/**
 * Audita el Excel de Pulpos contra el inventario actual y reporta cuáles
 * productos están en el Excel pero NO en la BD.
 *
 * DRY RUN por default. Para INSERTAR los faltantes, corre con --insertar.
 *
 * Match con la BD:
 *   - Primero por código de barras (exacto)
 *   - Luego por nombre normalizado
 *
 * Para los faltantes inserta con foto_url='' (placeholder) — después se
 * puede correr el script de DDG para descargar la foto real.
 *
 * USO:
 *   node scripts/auditar-faltantes-pulpos.mjs           # solo reporta
 *   node scripts/auditar-faltantes-pulpos.mjs --insertar  # agrega los faltantes
 */

import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const INSERTAR = process.argv.includes('--insertar')
const XLSX_PATH = '/Users/cabocommandbot/Downloads/Productos-2026-06-16-14-53.xlsx'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const [k, ...rest] = l.split('='); return [k.trim(), rest.join('=').trim().replace(/^['"]|['"]$/g, '')] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// ── 1. Leer Excel ────────────────────────────────────────
console.log(`Leyendo ${XLSX_PATH}\n`)
const wb = XLSX.readFile(XLSX_PATH)
const sheet = wb.Sheets[wb.SheetNames[0]]
const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null })

const COL = {
  nombre: '__EMPTY', codigo: '__EMPTY_8', sku: '__EMPTY_9',
  categoria: '__EMPTY_5', marca: '__EMPTY_6', unidad: '__EMPTY_7',
  lote: '__EMPTY_15', caducidad: '__EMPTY_17',
  stock: '__EMPTY_19', stockMin: '__EMPTY_20',
  ubicacion: '__EMPTY_22',
  precioPub: '__EMPTY_23', costo: '__EMPTY_27',
  iva: '__EMPTY_29', claveSat: '__EMPTY_31', receta: '__EMPTY_32',
  descripcion: '__EMPTY_4',
}
const filasExcel = rawRows.slice(1).filter(r => r[COL.nombre])
console.log(`Filas con producto en Excel: ${filasExcel.length}\n`)

// ── 2. Cargar BD ────────────────────────────────
const { data: productosBd } = await supabase
  .from('inventario_productos')
  .select('id, nombre, codigo_barras')
  .eq('activo', true)
const porCodigo = new Map()
const porNombre = new Map()
const normalizar = s => String(s ?? '').trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
for (const p of productosBd ?? []) {
  if (p.codigo_barras) porCodigo.set(String(p.codigo_barras).trim(), p)
  porNombre.set(normalizar(p.nombre), p)
}
console.log(`Productos activos en BD: ${productosBd?.length ?? 0}\n`)

// ── 3. Identifica faltantes ──────────────────────
const siNo = v => {
  if (v == null) return null
  const s = String(v).trim().toLowerCase()
  return s === 'si' || s === 'sí' ? true : (s === 'no' ? false : null)
}
const parseDate = v => {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const d = new Date(String(v))
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}
const parseNum = v => {
  if (v == null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

const faltantes = []
const presentes = []
for (const f of filasExcel) {
  const codigo = f[COL.codigo] ? String(f[COL.codigo]).trim() : null
  const nombre = String(f[COL.nombre]).trim()
  let prod = codigo ? porCodigo.get(codigo) : null
  if (!prod) prod = porNombre.get(normalizar(nombre))
  if (!prod) {
    faltantes.push({ codigo, nombre, fila: f })
  } else {
    presentes.push({ codigo, nombre, id: prod.id })
  }
}

console.log(`━━━ Resultado ━━━`)
console.log(`Ya en BD:    ${presentes.length}`)
console.log(`FALTANTES:   ${faltantes.length}`)
console.log()

if (faltantes.length > 0) {
  console.log(`━━━ Productos faltantes (primeros 20) ━━━`)
  for (const fa of faltantes.slice(0, 20)) {
    const cod = fa.codigo ? ` [${fa.codigo}]` : ''
    console.log(`  ${fa.nombre.slice(0, 50)}${cod}`)
  }
  if (faltantes.length > 20) console.log(`  ... y ${faltantes.length - 20} más`)
  console.log()
}

// ── 4. INSERTAR si --insertar ──────────────────────
if (!INSERTAR) {
  console.log(`⚠ DRY RUN — no se insertó nada. Para agregar los ${faltantes.length} faltantes:`)
  console.log(`   node scripts/auditar-faltantes-pulpos.mjs --insertar`)
  process.exit(0)
}

if (faltantes.length === 0) {
  console.log('✓ Sin nada que insertar.')
  process.exit(0)
}

console.log(`━━━ Insertando ${faltantes.length} productos faltantes ━━━`)
let insertados = 0
let errores = 0
for (let i = 0; i < faltantes.length; i++) {
  const fa = faltantes[i]
  const f = fa.fila

  const stock = parseNum(f[COL.stock]) ?? 0
  const precio = parseNum(f[COL.precioPub]) ?? 0
  const costo = parseNum(f[COL.costo])
  const lote = f[COL.lote] ? String(f[COL.lote]).trim() : null
  const cad = parseDate(f[COL.caducidad])
  const sat = f[COL.claveSat] ? String(f[COL.claveSat]).trim() : null
  const receta = siNo(f[COL.receta])
  const iva = siNo(f[COL.iva])
  const sku = f[COL.sku] ? String(f[COL.sku]).trim() : null
  const marca = f[COL.marca] ? String(f[COL.marca]).trim() : null
  const ubic = f[COL.ubicacion] ? String(f[COL.ubicacion]).trim() : null
  const desc = f[COL.descripcion] ? String(f[COL.descripcion]).trim() : null
  const categoria = f[COL.categoria] ? String(f[COL.categoria]).trim() : null
  const unidad = f[COL.unidad] ? String(f[COL.unidad]).trim() : 'unidad'

  const insertData = {
    nombre: fa.nombre,
    precio_mxn: precio,
    stock,
    stock_minimo: parseNum(f[COL.stockMin]) ?? 3,
    unidad_stock: unidad,
    categoria,
    codigo_barras: fa.codigo,
    activo: true,
    // Campos 0041
    sku, marca, ubicacion: ubic, descripcion: desc,
    costo_mxn: costo,
    cobra_iva: iva ?? false,
    requiere_receta: receta ?? false,
    lote,
    fecha_caducidad: cad,
    clave_sat: sat,
  }

  const { error } = await supabase.from('inventario_productos').insert(insertData)
  if (error) {
    console.log(`[${i + 1}] ✗ ${fa.nombre.slice(0, 35)} → ${error.message}`)
    errores++
  } else {
    insertados++
    if ((i + 1) % 10 === 0) console.log(`[${i + 1}/${faltantes.length}] OK`)
  }
}

console.log(`\n✓ Insertados: ${insertados}`)
console.log(`✗ Errores:    ${errores}`)
console.log(`\n📸 Siguiente paso para fotos:`)
console.log(`   node scripts/descargar-fotos-ddg.mjs`)
console.log(`   (descarga foto solo para los que tienen foto_url=null/'')`)
