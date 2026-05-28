/**
 * Descubrimiento de competidores con IA (Claude / GPT).
 * No requiere Meta Ad Library — usa el conocimiento del modelo sobre
 * negocios reales en Los Cabos / Baja California Sur.
 *
 * Clave: EXCLUYE los propios negocios de la compañía para no sugerir
 * un negocio propio como competidor.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getAIProvider } from '@/lib/ai/provider'
import { openai, OPENAI_MODEL } from '@/lib/ai/openai'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'

type CompetidorSugerido = {
  nombre: string
  url: string | null
  motivo: string
  fuerza: number  // 1-10 qué tan fuerte/relevante es
}

const SYSTEM = `Eres analista de competencia para negocios en Los Cabos, Baja California Sur, México.
Te paso un negocio y una lista de negocios PROPIOS de la misma empresa (que NO debes sugerir como competidores).
Devuelve los competidores REALES más fuertes de ese negocio en la zona (Los Cabos, San José del Cabo, Cabo San Lucas).

Reglas:
- NUNCA incluyas ninguno de los negocios propios listados.
- Solo competidores reales que conozcas de la zona o tipo de negocio.
- Si no conoces competidores específicos de la zona, sugiere tipos genéricos realistas (ej: "Farmacias Guadalajara sucursal Cabo").
- Máximo 5.
- fuerza: 1-10 según qué tan fuerte es el competidor.

Responde SOLO JSON válido: {"competidores": [{"nombre": "...", "url": null, "motivo": "...", "fuerza": N}]}`

async function pedirCompetidores(negocioDesc: string, propios: string[]): Promise<CompetidorSugerido[]> {
  const userMsg = `NEGOCIO A ANALIZAR:\n${negocioDesc}\n\nNEGOCIOS PROPIOS (NO sugerir estos):\n${propios.join(', ')}`

  try {
    let raw = '{}'
    if (getAIProvider() === 'anthropic') {
      const resp = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 700,
        system: SYSTEM,
        messages: [{ role: 'user', content: userMsg }],
      })
      const txt = resp.content.find((b) => b.type === 'text')
      raw = txt && txt.type === 'text' ? txt.text : '{}'
      // Claude a veces envuelve en ```json
      raw = raw.replace(/```json\s*|\s*```/g, '').trim()
    } else {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: 700,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userMsg },
        ],
      })
      raw = completion.choices[0]?.message?.content ?? '{}'
    }

    const parsed = JSON.parse(raw) as { competidores?: CompetidorSugerido[] }
    return (parsed.competidores ?? []).slice(0, 5)
  } catch {
    return []
  }
}

export async function descubrirCompetidoresIA(): Promise<{ nuevas: number; errores: string[] }> {
  const admin = createAdminClient()
  const errores: string[] = []
  let nuevas = 0

  const { data: negocios, error } = await admin
    .from('negocios')
    .select('id, nombre, tipo, keywords_busqueda, notas')
    .eq('activo', true)
  if (error) return { nuevas: 0, errores: [error.message] }

  const lista = negocios ?? []
  // Nombres propios para excluir (todos los negocios de la empresa)
  const nombresPropios = lista.map((n) => n.nombre)

  // Ya sugeridos / registrados (para no duplicar)
  const [{ data: yaSug }, { data: yaReg }] = await Promise.all([
    admin.from('radar_competidores_sugeridos').select('negocio_id, competidor_nombre'),
    admin.from('radar_competidores').select('negocio_id, competidor_nombre'),
  ])

  // Solo analiza negocios "comerciales" (no Casa/General)
  const analizables = lista.filter((n) => !['casa', 'general'].includes(n.tipo))

  for (const n of analizables) {
    try {
      const desc = `Nombre: ${n.nombre}\nTipo: ${n.tipo}${n.keywords_busqueda ? `\nKeywords: ${n.keywords_busqueda}` : ''}${n.notas ? `\nNotas: ${n.notas}` : ''}`
      const competidores = await pedirCompetidores(desc, nombresPropios)

      const yaSugSet = new Set(
        (yaSug ?? []).filter((s) => s.negocio_id === n.id).map((s) => s.competidor_nombre.toLowerCase())
      )
      const yaRegSet = new Set(
        (yaReg ?? []).filter((r) => r.negocio_id === n.id).map((r) => r.competidor_nombre.toLowerCase())
      )
      const propiosSet = new Set(nombresPropios.map((x) => x.toLowerCase()))

      for (const c of competidores) {
        const nombreLower = c.nombre.toLowerCase()
        // Doble seguridad: excluir propios + ya existentes
        if (propiosSet.has(nombreLower)) continue
        if (yaSugSet.has(nombreLower) || yaRegSet.has(nombreLower)) continue

        const { error: upErr } = await admin
          .from('radar_competidores_sugeridos')
          .upsert({
            negocio_id: n.id,
            competidor_nombre: c.nombre,
            url: c.url,
            motivo: `${c.motivo} (fuerza ${c.fuerza}/10 · detectado por IA)`,
            ads_activos_count: c.fuerza,  // reuso el campo para ordenar por fuerza
            keywords_match: n.keywords_busqueda || n.tipo,
            primera_vez_visto_at: new Date().toISOString(),
            estado: 'pendiente',
          }, { onConflict: 'negocio_id,competidor_nombre', ignoreDuplicates: true })

        if (upErr) errores.push(`${c.nombre}: ${upErr.message}`)
        else nuevas++
      }
    } catch (e) {
      errores.push(`${n.nombre}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { nuevas, errores }
}
