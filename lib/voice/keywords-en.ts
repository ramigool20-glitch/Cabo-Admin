/**
 * Palabras clave en inglés para detectar:
 *   1. Clientes turistas (cualquier word inglesa común)
 *   2. Categorías de evento (precio/cancelación/devolución/etc)
 */

import type { Categoria } from './keywords'

// Palabras inglesas comunes que aparecen en cualquier conversación de venta
// Si se detecta CUALQUIERA, asumimos que cliente habla inglés
export const PALABRAS_INGLES_COMUNES = [
  'hello', 'hi', 'hey', 'thanks', 'thank you', 'please', 'sorry', 'okay',
  'yes', 'yeah', 'no', 'sure', 'right', 'good', 'great', 'fine',
  'i need', 'i want', 'i would', 'can i', 'could i', 'may i', 'do you',
  'where is', 'how much', 'how many', 'what is', 'is this', 'are these',
  'cash', 'card', 'credit', 'debit', 'dollars', 'pesos',
  'medication', 'medicine', 'pills', 'tablets', 'prescription',
  'morning', 'afternoon', 'evening',
  'today', 'tomorrow',
]

// Keywords con categoría en inglés
export const KEYWORDS_EN: Array<{ patron: string; categoria: Categoria }> = [
  // PRECIO
  { patron: 'how much',         categoria: 'precio' },
  { patron: 'how much is',      categoria: 'precio' },
  { patron: 'what is the price', categoria: 'precio' },
  { patron: 'how much does',    categoria: 'precio' },
  { patron: 'how much for',     categoria: 'precio' },
  { patron: 'the price',        categoria: 'precio' },
  { patron: 'how many pesos',   categoria: 'precio' },
  { patron: 'how many dollars', categoria: 'precio' },

  // CANCELACION
  { patron: 'cancel',           categoria: 'cancelacion' },
  { patron: 'never mind',       categoria: 'cancelacion' },
  { patron: 'forget it',        categoria: 'cancelacion' },
  { patron: 'i changed my mind', categoria: 'cancelacion' },

  // DEVOLUCION
  { patron: 'return',           categoria: 'devolucion' },
  { patron: 'refund',           categoria: 'devolucion' },
  { patron: 'exchange',         categoria: 'devolucion' },
  { patron: 'not working',      categoria: 'devolucion' },
  { patron: 'broken',           categoria: 'devolucion' },
  { patron: 'expired',          categoria: 'devolucion' },
  { patron: 'bad quality',      categoria: 'devolucion' },

  // PROBLEMA
  { patron: 'manager',          categoria: 'problema' },
  { patron: 'supervisor',       categoria: 'problema' },
  { patron: 'complaint',        categoria: 'problema' },
  { patron: 'this is fraud',    categoria: 'problema' },
  { patron: 'scam',             categoria: 'problema' },
  { patron: 'ripoff',           categoria: 'problema' },
  { patron: 'you stole',        categoria: 'problema' },
  { patron: 'call the police',  categoria: 'problema' },

  // FIADO
  { patron: 'pay later',        categoria: 'fiado' },
  { patron: 'put it on my tab', categoria: 'fiado' },
  { patron: 'i owe you',        categoria: 'fiado' },

  // GENERAL
  { patron: 'venmo',            categoria: 'general' },
  { patron: 'apple pay',        categoria: 'general' },
  { patron: 'google pay',       categoria: 'general' },
]

/** Detecta si el texto está en inglés (por incidencia de palabras comunes). */
export function detectarIngles(texto: string): boolean {
  const t = texto.toLowerCase()
  // Si encuentra al menos 1 palabra común inglesa de >= 3 letras → inglés
  for (const w of PALABRAS_INGLES_COMUNES) {
    if (t.includes(w)) return true
  }
  return false
}

/** Busca keyword en inglés en el texto. */
export function buscarKeywordIngles(texto: string): { keyword: string; categoria: Categoria } | null {
  const t = texto.toLowerCase()
  for (const { patron, categoria } of KEYWORDS_EN) {
    if (t.includes(patron)) {
      return { keyword: patron, categoria }
    }
  }
  return null
}
