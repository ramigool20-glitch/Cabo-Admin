/**
 * Detector de montos hablados en es/en.
 * Convierte texto a número y detecta moneda.
 *
 * Ejemplos:
 *   "son 250 pesos"        → { monto: 250, moneda: 'MXN' }
 *   "fifty dollars please" → { monto: 50, moneda: 'USD' }
 *   "$1,500"               → { monto: 1500, moneda: 'MXN' }
 *   "two hundred bucks"    → { monto: 200, moneda: 'USD' }
 *   "doscientos cincuenta" → { monto: 250, moneda: 'MXN' }
 */

import { normalizar } from './keywords'

export type MontoDetectado = {
  monto: number
  moneda: 'MXN' | 'USD'
  texto_origen: string
}

// Números españoles a dígitos
const NUM_ES: Record<string, number> = {
  'cero': 0, 'uno': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
  'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10, 'once': 11, 'doce': 12,
  'trece': 13, 'catorce': 14, 'quince': 15, 'dieciseis': 16, 'diecisiete': 17,
  'dieciocho': 18, 'diecinueve': 19, 'veinte': 20, 'veintiuno': 21, 'veintidos': 22,
  'veintitres': 23, 'veinticuatro': 24, 'veinticinco': 25, 'veintiseis': 26,
  'veintisiete': 27, 'veintiocho': 28, 'veintinueve': 29, 'treinta': 30,
  'cuarenta': 40, 'cincuenta': 50, 'sesenta': 60, 'setenta': 70, 'ochenta': 80,
  'noventa': 90, 'cien': 100, 'ciento': 100,
  'doscientos': 200, 'doscientas': 200,
  'trescientos': 300, 'trescientas': 300,
  'cuatrocientos': 400, 'cuatrocientas': 400,
  'quinientos': 500, 'quinientas': 500,
  'seiscientos': 600, 'seiscientas': 600,
  'setecientos': 700, 'setecientas': 700,
  'ochocientos': 800, 'ochocientas': 800,
  'novecientos': 900, 'novecientas': 900,
  'mil': 1000,
}

// Números ingleses
const NUM_EN: Record<string, number> = {
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11,
  'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16,
  'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20, 'thirty': 30,
  'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80,
  'ninety': 90, 'hundred': 100, 'thousand': 1000,
}

// Marcadores de moneda
const ES_PESOS = /\b(pesos?|pesitos?|varos?|mxn|mx\$?|\$)\b/i
const EN_USD = /\b(dollars?|bucks?|usd|us\$?)\b/i

// Marcadores de venta (Tania confirmando precio)
const FRASES_VENTA = [
  // ES
  /\b(son|es|cuesta|vale|sale en|total)\s/i,
  /\b(te (sale|cobro)|son en total)\s/i,
  /\b(cobr[éo])\b/i,
  // EN
  /\b(that's?|that will be|comes? to|costs?)\s/i,
  /\b(your total is|the price is|will be)\s/i,
  /\b(charged?|paid?)\b/i,
]

/** Convierte palabras numéricas españolas a número.
 *  Ej: "doscientos cincuenta" → 250 */
function parseSpanishWords(texto: string): number | null {
  const palabras = texto.toLowerCase().split(/\s+/)
  let total = 0
  let acumulador = 0
  let encontroAlgo = false
  for (const p of palabras) {
    if (p === 'y') continue  // "doscientos y cincuenta"
    if (p in NUM_ES) {
      encontroAlgo = true
      const n = NUM_ES[p]
      if (n === 1000) {
        // "mil quinientos" o "dos mil"
        acumulador = (acumulador || 1) * 1000
        total += acumulador
        acumulador = 0
      } else if (n === 100 && acumulador > 0) {
        acumulador *= 100
      } else {
        acumulador += n
      }
    }
  }
  total += acumulador
  return encontroAlgo && total > 0 ? total : null
}

function parseEnglishWords(texto: string): number | null {
  const palabras = texto.toLowerCase().split(/\s+/)
  let total = 0
  let acumulador = 0
  let encontroAlgo = false
  for (const p of palabras) {
    if (p === 'and') continue
    if (p in NUM_EN) {
      encontroAlgo = true
      const n = NUM_EN[p]
      if (n === 1000) {
        acumulador = (acumulador || 1) * 1000
        total += acumulador
        acumulador = 0
      } else if (n === 100) {
        acumulador = (acumulador || 1) * 100
      } else {
        acumulador += n
      }
    }
  }
  total += acumulador
  return encontroAlgo && total > 0 ? total : null
}

/** Detecta el primer monto en el texto. */
export function detectarMonto(texto: string): MontoDetectado | null {
  const tNorm = normalizar(texto)
  const tOrig = texto.trim()

  // 1. Buscar pattern "$XXX" con punto/coma
  const mDollar = tOrig.match(/\$\s*([\d]{1,3}(?:[,.]?\d{3})*(?:\.\d{1,2})?)/)
  if (mDollar) {
    const n = parseFloat(mDollar[1].replace(/,/g, ''))
    if (!isNaN(n) && n > 0) {
      const esUsd = EN_USD.test(tOrig)
      return {
        monto: n,
        moneda: esUsd ? 'USD' : 'MXN',
        texto_origen: mDollar[0],
      }
    }
  }

  // 2. Buscar números arábigos con moneda explícita
  const mNumPesos = tNorm.match(/\b(\d{1,3}(?:[,.]?\d{3})*(?:\.\d{1,2})?)\s*(pesos?|pesitos?|varos?|mxn)\b/i)
  if (mNumPesos) {
    const n = parseFloat(mNumPesos[1].replace(/,/g, ''))
    if (!isNaN(n) && n > 0) {
      return { monto: n, moneda: 'MXN', texto_origen: mNumPesos[0] }
    }
  }
  const mNumUsd = tNorm.match(/\b(\d{1,3}(?:[,.]?\d{3})*(?:\.\d{1,2})?)\s*(dollars?|bucks?|usd)\b/i)
  if (mNumUsd) {
    const n = parseFloat(mNumUsd[1].replace(/,/g, ''))
    if (!isNaN(n) && n > 0) {
      return { monto: n, moneda: 'USD', texto_origen: mNumUsd[0] }
    }
  }

  // 3. Palabras españolas: "doscientos cincuenta pesos"
  const palabrasNum = tNorm.match(/(?:(?:cero|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos|mil|y)\s*)+/i)
  if (palabrasNum) {
    const n = parseSpanishWords(palabrasNum[0])
    if (n && n > 0) {
      const esUsd = EN_USD.test(tNorm)
      return { monto: n, moneda: esUsd ? 'USD' : 'MXN', texto_origen: palabrasNum[0] }
    }
  }

  // 4. Palabras inglesas: "fifty dollars"
  const enWords = tNorm.match(/(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and)\s*)+/i)
  if (enWords) {
    const n = parseEnglishWords(enWords[0])
    if (n && n > 0) {
      const esUsd = EN_USD.test(tNorm)
      const esPesos = ES_PESOS.test(tNorm)
      // Si dice "fifty pesos" → MXN, si "fifty dollars" → USD, si nada y es ingles → USD default
      return {
        monto: n,
        moneda: esUsd ? 'USD' : esPesos ? 'MXN' : 'USD',
        texto_origen: enWords[0],
      }
    }
  }

  // 5. Solo número arábigo sin moneda explícita pero precedido por palabra de venta
  if (FRASES_VENTA.some(r => r.test(tOrig))) {
    const m = tNorm.match(/\b(\d{2,5})\b/)
    if (m) {
      const n = parseInt(m[1])
      if (n >= 20 && n <= 99999) {  // rango razonable de precio
        return { monto: n, moneda: 'MXN', texto_origen: m[0] }
      }
    }
  }

  return null
}

/** Detecta si el contexto sugiere que es una venta (no solo mención de monto). */
export function esVentaProbable(texto: string): boolean {
  return FRASES_VENTA.some(r => r.test(texto))
}
