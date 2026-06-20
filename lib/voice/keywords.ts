/**
 * Diccionario de palabras clave para detectar momentos importantes en el POS.
 * Solo se activa la grabación cuando se detecta alguna de estas.
 */

export type Categoria = 'precio' | 'cancelacion' | 'devolucion' | 'problema' | 'fiado' | 'general'

export type KeywordMatch = {
  keyword: string
  categoria: Categoria
}

// Frases/palabras de activación organizadas por categoría
// Se buscan como substrings (ignorando acentos y mayúsculas)
export const KEYWORDS: Array<{ patron: string; categoria: Categoria }> = [
  // PRECIO — clientes preguntando cuánto cuesta
  { patron: 'cuanto cuesta',     categoria: 'precio' },
  { patron: 'a como',            categoria: 'precio' },
  { patron: 'que precio',        categoria: 'precio' },
  { patron: 'cuanto vale',       categoria: 'precio' },
  { patron: 'el precio',         categoria: 'precio' },
  { patron: 'cuanto es',         categoria: 'precio' },

  // CANCELACION — querer dar marcha atrás
  { patron: 'cancelar',          categoria: 'cancelacion' },
  { patron: 'cancela',           categoria: 'cancelacion' },
  { patron: 'ya no',             categoria: 'cancelacion' },
  { patron: 'mejor no',          categoria: 'cancelacion' },
  { patron: 'olvidalo',          categoria: 'cancelacion' },
  { patron: 'no me lo lleve',    categoria: 'cancelacion' },

  // DEVOLUCION — regresar producto
  { patron: 'devolver',          categoria: 'devolucion' },
  { patron: 'devolucion',        categoria: 'devolucion' },
  { patron: 'devolu',            categoria: 'devolucion' },
  { patron: 'regresar',          categoria: 'devolucion' },
  { patron: 'cambiar el',        categoria: 'devolucion' },
  { patron: 'no me sirve',       categoria: 'devolucion' },
  { patron: 'no sirvio',         categoria: 'devolucion' },
  { patron: 'esta vencido',      categoria: 'devolucion' },
  { patron: 'esta caduco',       categoria: 'devolucion' },
  { patron: 'caducado',          categoria: 'devolucion' },

  // PROBLEMA — quejas, conflictos
  { patron: 'queja',             categoria: 'problema' },
  { patron: 'molesto',           categoria: 'problema' },
  { patron: 'enojado',           categoria: 'problema' },
  { patron: 'el gerente',        categoria: 'problema' },
  { patron: 'el dueño',          categoria: 'problema' },
  { patron: 'supervisor',        categoria: 'problema' },
  { patron: 'esto es un fraud',  categoria: 'problema' },
  { patron: 'me robaron',        categoria: 'problema' },

  // FIADO — crédito informal
  { patron: 'fiado',             categoria: 'fiado' },
  { patron: 'me llevo y luego',  categoria: 'fiado' },
  { patron: 'pago despues',      categoria: 'fiado' },
  { patron: 'anota',             categoria: 'fiado' },
  { patron: 'a credito',         categoria: 'fiado' },
  { patron: 'me lo apuntas',     categoria: 'fiado' },

  // GENERAL útiles para auditoría
  { patron: 'efectivo',          categoria: 'general' },
  { patron: 'tarjeta',           categoria: 'general' },
  { patron: 'mercado pago',      categoria: 'general' },
  { patron: 'transferencia',     categoria: 'general' },
]

/** Normaliza: minúsculas, sin acentos */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Busca si el texto contiene alguna palabra clave */
export function buscarKeyword(texto: string): KeywordMatch | null {
  const t = normalizar(texto)
  for (const { patron, categoria } of KEYWORDS) {
    if (t.includes(patron)) {
      return { keyword: patron, categoria }
    }
  }
  return null
}
