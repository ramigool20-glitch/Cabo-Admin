/**
 * Importa los campos extendidos del Excel exportado de Pulpos al inventario
 * actual de Cabo Admin. NO sobreescribe stock, precio público, ni nombre
 * (a menos que el flag --pisar-precios esté presente).
 *
 * Estrategia de match:
 *   1. Por código de barras (confiable)
 *   2. Por nombre normalizado (fallback)
 *
 * Campos actualizados por producto encontrado:
 *   • costo_mxn         ← Costo
 *   • sku               ← SKU
 *   • marca             ← Marca
 *   • ubicacion         ← Ubicación
 *   • lote              ← Lote
 *   • fecha_caducidad   ← Caducidad del Lote
 *   • clave_sat         ← Clave SAT
 *   • requiere_receta   ← Receta Médica (Si/No → bool)
 *   • cobra_iva         ← IVA (Si/No → bool)
 *   • descripcion       ← Descripción
 *
 * USO:
 *   DRY RUN (solo reporta):  node scripts/importar-pulpos-xlsx.mjs
 *   APLICAR cambios:          node scripts/importar-pulpos-xlsx.mjs --aplicar
 */

import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const APLICAR = process.argv.includes('--aplicar')
const XLSX_PATH = process.argv.find(a => a.endsWith('.xlsx'))
  ?? '/Users/cabocommandbot/Downloads/Productos-2026-06-16-14-53.xlsx'

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

// Saltamos fila 0 que es el header
const COL = {
  nombre: '__EMPTY', codigo: '__EMPTY_8', sku: '__EMPTY_9',
  categoria: '__EMPTY_5', marca: '__EMPTY_6', unidad: '__EMPTY_7',
  lote: '__EMPTY_15', caducidad: '__EMPTY_17',
  stock: '__EMPTY_19', stockMin: '__EMPTY_20',
  ubicacion: '__EMPTY_22',
  precioPub: '__EMPTY_23', costo: '__EMPTY_27',
  impuestos: '__EMPTY_28', iva: '__EMPTY_29',
  claveSat: '__EMPTY_31', receta: '__EMPTY_32',
  descripcion: '__EMPTY_4',
}
const filas = rawRows.slice(1).filter(r => r[COL.nombre])
console.log(`Filas con producto: ${filas.length}\n`)

// ── 2. Cargar productos actuales de BD ───────────────────
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
console.log(`Productos en BD: ${productosBd?.length ?? 0}`)

// ── 3. Para cada fila, intenta match y prepara update ────
const siNo = v => {
  if (v == null) return null
  const s = String(v).trim().toLowerCase()
  return s === 'si' || s === 'sí' ? true : (s === 'no' ? false : null)
}
const parseDate = v => {
  if (!v) return null
  // XLSX puede dar Date object o string
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

const updates = []
let matchedCodigo = 0
let matchedNombre = 0
let sinMatch = 0

for (const f of filas) {
  const codigo = f[COL.codigo] ? String(f[COL.codigo]).trim() : null
  const nombre = String(f[COL.nombre]).trim()

  let prod = codigo ? porCodigo.get(codigo) : null
  let fuente = 'codigo'
  if (!prod) {
    prod = porNombre.get(normalizar(nombre))
    fuente = 'nombre'
  }
  if (!prod) { sinMatch++; continue }
  if (fuente === 'codigo') matchedCodigo++; else matchedNombre++

  // Prepara update solo con campos que aportan valor
  const upd = {}
  const costo = parseNum(f[COL.costo])
  if (costo != null && costo > 0) upd.costo_mxn = costo
  const sku = f[COL.sku]; if (sku) upd.sku = String(sku).trim()
  const marca = f[COL.marca]; if (marca) upd.marca = String(marca).trim()
  const ubic = f[COL.ubicacion]; if (ubic) upd.ubicacion = String(ubic).trim()
  const lote = f[COL.lote]; if (lote) upd.lote = String(lote).trim()
  const cad = parseDate(f[COL.caducidad]); if (cad) upd.fecha_caducidad = cad
  const sat = f[COL.claveSat]; if (sat) upd.clave_sat = String(sat).trim()
  const receta = siNo(f[COL.receta]); if (receta != null) upd.requiere_receta = receta
  const iva = siNo(f[COL.iva] ?? f[COL.impuestos]); if (iva != null) upd.cobra_iva = iva
  const desc = f[COL.descripcion]; if (desc) upd.descripcion = String(desc).trim()

  if (Object.keys(upd).length === 0) continue
  updates.push({ id: prod.id, nombre, upd, fuente })
}

// ── 4. Reporte ───────────────────────────────────────────
console.log(`\n━━━ Match ━━━`)
console.log(`Por código:  ${matchedCodigo}`)
console.log(`Por nombre:  ${matchedNombre}`)
console.log(`Sin match:   ${sinMatch}`)
console.log(`Updates a aplicar: ${updates.length}`)

const conCosto = updates.filter(u => u.upd.costo_mxn != null).length
const conMarca = updates.filter(u => u.upd.marca).length
const conUbic = updates.filter(u => u.upd.ubicacion).length
const conCad = updates.filter(u => u.upd.fecha_caducidad).length
const conRx = updates.filter(u => u.upd.requiere_receta === true).length
const conSat = updates.filter(u => u.upd.clave_sat).length
console.log(`\nCon costo:      ${conCosto}`)
console.log(`Con marca:      ${conMarca}`)
console.log(`Con ubicación:  ${conUbic}`)
console.log(`Con caducidad:  ${conCad}`)
console.log(`Receta médica:  ${conRx}`)
console.log(`Con clave SAT:  ${conSat}`)

console.log(`\nEjemplos (primeros 5):`)
for (const u of updates.slice(0, 5)) {
  console.log(`  ${u.nombre.slice(0, 35).padEnd(35)} → ${JSON.stringify(u.upd)}`)
}

if (!APLICAR) {
  console.log(`\n⚠ DRY RUN — no se aplicó nada. Para aplicar:`)
  console.log(`   node scripts/importar-pulpos-xlsx.mjs --aplicar`)
  process.exit(0)
}

// ── 5. APLICAR ───────────────────────────────────────────
console.log(`\n━━━ Aplicando ${updates.length} updates ━━━`)
let aplicados = 0, errores = 0
for (let i = 0; i < updates.length; i++) {
  const u = updates[i]
  const { error } = await supabase
    .from('inventario_productos')
    .update(u.upd)
    .eq('id', u.id)
  if (error) {
    console.log(`[${i + 1}] ✗ ${u.nombre.slice(0, 35)} → ${error.message}`)
    errores++
  } else {
    aplicados++
    if ((i + 1) % 50 === 0) console.log(`[${i + 1}/${updates.length}] OK`)
  }
}
console.log(`\n✓ Aplicados: ${aplicados}`)
console.log(`✗ Errores:   ${errores}`)
