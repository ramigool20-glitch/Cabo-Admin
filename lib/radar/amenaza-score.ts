import { openai, OPENAI_MODEL } from '@/lib/ai/openai'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'
import { getAIProvider } from '@/lib/ai/provider'

export type ScoreAmenaza = {
  score: number              // 1-10
  razon: string              // explicación corta (max 200 chars)
  recomendacion: string | null
}

type Args = {
  miNegocio: {
    nombre: string
    tipo: string
    descripcion?: string | null
    keywords?: string | null
  }
  competidor: {
    nombre: string
    url?: string | null
    descripcion?: string | null
    tipo: string
  }
  adsActivos?: number
  ultimaActividad?: string | null
}

const PROMPT_TEMPLATE = `Eres un analista de competencia comercial. Tu tarea es evaluar qué tan amenaza es un competidor para un negocio específico, con un puntaje de 1 a 10 donde:
- 1-3: amenaza baja (no compite directo o muy chico)
- 4-6: amenaza media (compite pero diferente segmento o nicho)
- 7-9: amenaza alta (compite directo, similar tamaño, segmento idéntico)
- 10: amenaza crítica (dominante del mercado, presupuesto enorme)

Responde SOLO con JSON válido: {"score": N, "razon": "...", "recomendacion": "..."}

Razón: máximo 180 caracteres, en español, concreta.
Recomendación: acción concreta, máximo 180 caracteres, opcional (puede ser null).`

export async function analizarAmenaza(args: Args): Promise<ScoreAmenaza> {
  const userMsg = `MI NEGOCIO:
Nombre: ${args.miNegocio.nombre}
Tipo: ${args.miNegocio.tipo}
${args.miNegocio.descripcion ? `Descripción: ${args.miNegocio.descripcion}` : ''}
${args.miNegocio.keywords ? `Keywords: ${args.miNegocio.keywords}` : ''}

COMPETIDOR:
Nombre: ${args.competidor.nombre}
Tipo de competencia: ${args.competidor.tipo}
${args.competidor.url ? `URL: ${args.competidor.url}` : ''}
${args.competidor.descripcion ? `Descripción: ${args.competidor.descripcion}` : ''}
${args.adsActivos != null ? `Ads activos detectados: ${args.adsActivos}` : ''}
${args.ultimaActividad ? `Última actividad: ${args.ultimaActividad}` : ''}

Evalúa qué tan amenaza es para mi negocio.`

  try {
    let content = '{}'
    if (getAIProvider() === 'anthropic') {
      const resp = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        system: PROMPT_TEMPLATE,
        messages: [{ role: 'user', content: userMsg }],
      })
      const txt = resp.content.find((b) => b.type === 'text')
      content = (txt && txt.type === 'text' ? txt.text : '{}').replace(/```json\s*|\s*```/g, '').trim()
    } else {
      const res = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT_TEMPLATE },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.2,
      })
      content = res.choices[0]?.message?.content ?? '{}'
    }

    const parsed = JSON.parse(content) as Partial<ScoreAmenaza>
    const score = Math.min(10, Math.max(1, Number(parsed.score) || 5))
    return {
      score,
      razon: (parsed.razon ?? '').slice(0, 200) || 'Sin análisis disponible',
      recomendacion: parsed.recomendacion ? String(parsed.recomendacion).slice(0, 200) : null,
    }
  } catch {
    // Fallback heurístico si IA falla
    let score = 5
    if (args.competidor.tipo === 'directo') score = 7
    else if (args.competidor.tipo === 'indirecto') score = 4
    else score = 3
    if (args.adsActivos && args.adsActivos > 5) score = Math.min(10, score + 2)
    return {
      score,
      razon: `Análisis heurístico: ${args.competidor.tipo} con ${args.adsActivos ?? 0} ads.`,
      recomendacion: null,
    }
  }
}
