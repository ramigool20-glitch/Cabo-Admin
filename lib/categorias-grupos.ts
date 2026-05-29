/**
 * Capa de AGRUPACIÓN para el análisis de gastos. No toca las categorías del
 * formulario (lib/categorias.ts): solo agrupa los valores granulares en grupos
 * canónicos con etiqueta/emoji/color para mostrar "en qué gastamos más/menos".
 */
export type GrupoGasto = { id: string; label: string; emoji: string; color: string; text: string }

export const GRUPOS_GASTO: GrupoGasto[] = [
  { id: 'mercancia',     label: 'Mercancía',       emoji: '📦', color: 'bg-cyan-500',    text: 'text-cyan-300' },
  { id: 'nomina',        label: 'Nómina',          emoji: '👥', color: 'bg-indigo-500',  text: 'text-indigo-300' },
  { id: 'renta',         label: 'Renta',           emoji: '🏠', color: 'bg-amber-500',   text: 'text-amber-300' },
  { id: 'servicios',     label: 'Servicios',       emoji: '💡', color: 'bg-yellow-500',  text: 'text-yellow-300' },
  { id: 'publicidad',    label: 'Publicidad',      emoji: '📣', color: 'bg-pink-500',    text: 'text-pink-300' },
  { id: 'transporte',    label: 'Transporte',      emoji: '⛽', color: 'bg-orange-500',  text: 'text-orange-300' },
  { id: 'comida',        label: 'Comida',          emoji: '🍔', color: 'bg-red-500',     text: 'text-red-300' },
  { id: 'salud',         label: 'Salud/Clínica',   emoji: '🏥', color: 'bg-emerald-500', text: 'text-emerald-300' },
  { id: 'mantenimiento', label: 'Mantenimiento',   emoji: '🔧', color: 'bg-slate-500',   text: 'text-slate-300' },
  { id: 'comisiones',    label: 'Comisiones',      emoji: '💳', color: 'bg-fuchsia-500', text: 'text-fuchsia-300' },
  { id: 'impuestos',     label: 'Impuestos',       emoji: '🧾', color: 'bg-rose-600',    text: 'text-rose-300' },
  { id: 'casa',          label: 'Casa',            emoji: '🏡', color: 'bg-teal-500',    text: 'text-teal-300' },
  { id: 'otro',          label: 'Otro',            emoji: '•',  color: 'bg-zinc-600',    text: 'text-zinc-400' },
]

const POR_ID = new Map(GRUPOS_GASTO.map((g) => [g.id, g]))
export function grupoInfo(id: string): GrupoGasto {
  return POR_ID.get(id) ?? GRUPOS_GASTO[GRUPOS_GASTO.length - 1]
}

// Valor granular (del formulario o IA) → grupo canónico
const SINONIMOS: Record<string, string> = {
  producto: 'mercancia', mercancia: 'mercancia', 'mercancía': 'mercancia', suministros: 'mercancia', insumos: 'mercancia', inventario: 'mercancia',
  sueldo: 'nomina', nomina: 'nomina', 'nómina': 'nomina', salario: 'nomina',
  renta: 'renta', renta_casa: 'casa',
  internet: 'servicios', luz: 'servicios', agua: 'servicios', gas: 'servicios', streaming: 'servicios', telefono: 'servicios', 'teléfono': 'servicios', celular: 'servicios', servicios: 'servicios', servicio: 'servicios',
  marketing: 'publicidad', ads: 'publicidad', publicidad: 'publicidad', anuncios: 'publicidad',
  gasolina: 'transporte', transporte: 'transporte', combustible: 'transporte',
  despensa: 'comida', comida: 'comida', desayuno: 'comida', restaurante: 'comida', alimentos: 'comida',
  salud: 'salud', clinica: 'salud', 'clínica': 'salud', medicina: 'salud', farmacia: 'salud', medicamento: 'salud',
  mantenimiento: 'mantenimiento', mantenimiento_casa: 'mantenimiento', limpieza: 'casa', reparacion: 'mantenimiento',
  'comisión': 'comisiones', comision: 'comisiones', comisiones: 'comisiones',
  impuesto: 'impuestos', impuestos: 'impuestos',
  casa: 'casa', hogar: 'casa',
  otro: 'otro', otros: 'otro', 'ajuste-saldo': 'otro', ajuste: 'otro',
}

const KEYWORDS: Array<[RegExp, string]> = [
  [/gasolin|combustible|pemex|\buber\b|taxi|caseta/i, 'transporte'],
  [/renta|alquiler/i, 'renta'],
  [/\bluz\b|cfe|\bagua\b|internet|telmex|izzi|megacable|telefon|celular|recarga/i, 'servicios'],
  [/nomina|nómina|sueldo|salario|raya/i, 'nomina'],
  [/facebook|instagram|google ads|tiktok|publicid|marketing|anuncio|\bads\b/i, 'publicidad'],
  [/comida|desayuno|almuerzo|cena|restaurant|despensa|\bsuper\b|oxxo|panache/i, 'comida'],
  [/farmacia|medicament|medicina|clinic|laboratorio|doctor|hospital/i, 'salud'],
  [/mantenimiento|reparac|plomer|electricist|pintura/i, 'mantenimiento'],
  [/comision|comisión|stripe|mercado pago|paypal/i, 'comisiones'],
  [/impuesto|\bsat\b|\biva\b|predial/i, 'impuestos'],
  [/mercanc|producto|inventario|insumo|suministr|nadro|proveedor|marihuana|backpack/i, 'mercancia'],
  [/rossy|doméstica|domestica/i, 'casa'],
]

export function grupoDeCategoria(raw?: string | null, concepto?: string | null): string {
  if (raw) {
    const k = raw.trim().toLowerCase()
    if (POR_ID.has(k)) return k
    if (SINONIMOS[k]) return SINONIMOS[k]
    for (const [re, id] of KEYWORDS) if (re.test(raw)) return id
  }
  const txt = concepto ?? ''
  if (txt) for (const [re, id] of KEYWORDS) if (re.test(txt)) return id
  return 'otro'
}

type GastoRow = {
  tipo: string
  monto: number | string
  moneda: string
  categoria: string | null
  concepto?: string | null
  monto_mxn_equivalente?: number | string | null
}

export type DesgloseCat = { id: string; label: string; emoji: string; color: string; text: string; monto: number; pct: number; count: number }

export function desglosarCategorias(rows: GastoRow[], fxFallback?: number | null): { items: DesgloseCat[]; total: number } {
  const equiv = (r: GastoRow): number => {
    if (r.monto_mxn_equivalente != null) return Number(r.monto_mxn_equivalente)
    if (r.moneda === 'MXN') return Number(r.monto)
    if (r.moneda === 'USD' && fxFallback && fxFallback > 0) return Number(r.monto) * fxFallback
    return 0
  }
  const m = new Map<string, { monto: number; count: number }>()
  let total = 0
  for (const r of rows) {
    if (r.tipo !== 'gasto') continue
    const eq = equiv(r)
    if (eq <= 0) continue
    const id = grupoDeCategoria(r.categoria, r.concepto)
    const e = m.get(id) ?? { monto: 0, count: 0 }
    e.monto += eq
    e.count++
    m.set(id, e)
    total += eq
  }
  const items = Array.from(m.entries())
    .map(([id, v]) => {
      const g = grupoInfo(id)
      return { id, label: g.label, emoji: g.emoji, color: g.color, text: g.text, monto: v.monto, count: v.count, pct: total > 0 ? (v.monto / total) * 100 : 0 }
    })
    .sort((a, b) => b.monto - a.monto)
  return { items, total }
}
