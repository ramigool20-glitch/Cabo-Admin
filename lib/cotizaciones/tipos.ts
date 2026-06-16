/**
 * Tipos compartidos para cotizaciones y branding por negocio.
 */

export type CotizacionItem = {
  producto_id: string | null  // null si se agregó manual (no del inventario)
  nombre: string
  codigo_barras?: string | null
  cantidad: number
  precio_unitario_mxn: number
  subtotal_mxn: number
}

export type Cotizacion = {
  id: string
  folio: string
  negocio_id: string | null
  cliente_nombre: string
  cliente_email: string | null
  cliente_telefono: string | null
  cliente_rfc: string | null
  cliente_direccion: string | null
  items: CotizacionItem[]
  subtotal_mxn: number
  descuento_pct: number
  descuento_mxn: number
  iva_aplica: boolean
  iva_mxn: number
  total_mxn: number
  notas: string | null
  vigencia_dias: number
  estado: 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'expirada' | 'convertida'
  created_at: string
  updated_at: string
}

/** Datos de negocio que necesita el template de cotización */
export type NegocioBranding = {
  id: string
  nombre: string
  tipo: 'farmacia' | 'consultorio' | 'pagina_digital' | 'general'
  slogan: string | null
  rfc: string | null
  direccion: string | null
  telefono: string | null
  email: string | null
  url: string | null
  color_primario: string | null
  color_secundario: string | null
}

/**
 * Paleta y elementos visuales por tipo de negocio. El usuario puede
 * sobreescribir con `negocio.color_primario` / `color_secundario`.
 */
export type Tema = {
  primary: string
  secondary: string
  accent: string
  emoji: string
  decoracion: string
  gradient: { from: string; to: string }
}

const TEMAS: Record<NegocioBranding['tipo'], Tema> = {
  farmacia: {
    primary: '#10b981',      // emerald-500
    secondary: '#06b6d4',    // cyan-500
    accent: '#a7f3d0',       // emerald-200
    emoji: '💊',
    decoracion: '✚',
    gradient: { from: '#059669', to: '#0e7490' },
  },
  consultorio: {
    primary: '#3b82f6',      // blue-500
    secondary: '#06b6d4',    // cyan-500
    accent: '#bfdbfe',       // blue-200
    emoji: '🩺',
    decoracion: '♥',
    gradient: { from: '#1d4ed8', to: '#0891b2' },
  },
  pagina_digital: {
    primary: '#a855f7',      // purple-500
    secondary: '#ec4899',    // pink-500
    accent: '#e9d5ff',       // purple-200
    emoji: '🌐',
    decoracion: '⬡',
    gradient: { from: '#7c3aed', to: '#db2777' },
  },
  general: {
    primary: '#52525b',      // zinc-600
    secondary: '#71717a',    // zinc-500
    accent: '#d4d4d8',       // zinc-300
    emoji: '🏢',
    decoracion: '◆',
    gradient: { from: '#3f3f46', to: '#52525b' },
  },
}

export function temaDeNegocio(n: NegocioBranding): Tema {
  const base = TEMAS[n.tipo] ?? TEMAS.general
  return {
    ...base,
    primary: n.color_primario || base.primary,
    secondary: n.color_secundario || base.secondary,
    gradient: n.color_primario && n.color_secundario
      ? { from: n.color_primario, to: n.color_secundario }
      : base.gradient,
  }
}

/** Calcula subtotales y total a partir de items + opciones */
export function calcularTotales(
  items: CotizacionItem[],
  opciones: { descuento_pct?: number; iva_aplica?: boolean },
) {
  const subtotal = items.reduce((s, i) => s + i.subtotal_mxn, 0)
  const descPct = Math.max(0, Math.min(100, opciones.descuento_pct ?? 0))
  const descuento = subtotal * (descPct / 100)
  const baseDespuesDesc = subtotal - descuento
  const iva = opciones.iva_aplica ? baseDespuesDesc * 0.16 : 0
  const total = baseDespuesDesc + iva
  return { subtotal, descuento, iva, total }
}

/** Genera folio único basado en negocio + secuencia simple */
export function generarFolio(negocioCodigo: string, seq: number): string {
  const year = new Date().getFullYear()
  return `COT-${negocioCodigo.toUpperCase()}-${year}-${String(seq).padStart(4, '0')}`
}
