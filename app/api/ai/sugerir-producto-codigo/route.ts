/**
 * Sugerencia de producto a partir de un código de barras.
 * Usa Claude Sonnet con web_search para identificar el producto y devolver
 * nombre, categoría sugerida y precio estimado MXN.
 *
 * Solo se llama cuando el código NO existe ya en BD (lo verifica el cliente
 * con /api/inventario/buscar-codigo).
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BodySchema = z.object({
  codigo: z.string().min(4).max(40),
  categorias: z.array(z.string()).max(30).optional(),
})

export type SugerenciaProducto = {
  nombre: string | null
  categoria_sugerida: string | null
  precio_estimado_mxn: number | null
  descripcion: string | null
  confianza: 'alta' | 'media' | 'baja'
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const json = await req.json().catch(() => ({}))
  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const { codigo, categorias } = parsed.data
  const catsList = (categorias && categorias.length > 0)
    ? categorias.join(', ')
    : 'GENERICO, PATENTE, OTC, Cuidado Personal, Bebidas, Departamento de bebe, Antiácido, Choco'

  const prompt = `Identifica el producto con código de barras: ${codigo}

Es para una farmacia/abarrotes en Baja California Sur, México. Si encuentras el producto:
- Dame el nombre comercial limpio (sin "x12", sin gramaje doble, sin marca duplicada)
- Sugiere una categoría que encaje con: ${catsList}
- Estima precio venta al público en MXN (precio típico de farmacia, no mayoreo)

Si NO puedes identificarlo con seguridad, indica confianza baja y deja los campos en null.

Busca en internet ÚNICAMENTE si el código parece estándar (EAN-13 / UPC-A / EAN-8).
Responde con SOLO un JSON válido, sin markdown, exactamente con esta forma:

{
  "nombre": "string o null",
  "categoria_sugerida": "string o null",
  "precio_estimado_mxn": number o null,
  "descripcion": "string corta o null",
  "confianza": "alta" | "media" | "baja"
}`

  try {
    const resp = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      tools: [
        { type: 'web_search_20250305', name: 'web_search', max_uses: 3 } as never,
      ],
      messages: [{ role: 'user', content: prompt }],
    })

    // Concatena todos los text blocks de la respuesta
    const text = resp.content
      .flatMap(b => b.type === 'text' ? [b.text] : [])
      .join('\n')
      .trim()

    // Extrae el JSON (el modelo a veces lo envuelve en ```json ... ```)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({
        ok: true,
        sugerencia: { nombre: null, categoria_sugerida: null, precio_estimado_mxn: null, descripcion: null, confianza: 'baja' as const },
        raw: text.slice(0, 200),
      })
    }
    const sugerencia = JSON.parse(jsonMatch[0]) as SugerenciaProducto
    return NextResponse.json({ ok: true, sugerencia })
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'Error IA',
    }, { status: 500 })
  }
}
