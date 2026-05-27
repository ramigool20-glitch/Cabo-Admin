import { openai } from '@/lib/ai/openai'

export type RadarInsight = {
  tipo: 'noticia' | 'tendencia' | 'riesgo' | 'oportunidad' | 'evento_local'
  titulo: string
  resumen: string
  fuente: string | null
  fuente_url: string | null
  impacto: 'alta' | 'media' | 'baja'
  aplica_a: string[]
  recomendacion: string | null
  fecha_evento: string | null
}

const PROMPT_RADAR = `Eres el RADAR de inteligencia de mercado de Cabo Admin (Los Cabos, BCS, México).

Tu trabajo: identificar 5-10 insights ACCIONABLES que podrían afectar negocios en Los Cabos en las próximas semanas. Usa búsqueda web para encontrar información REAL y RECIENTE (últimos 7-14 días).

Negocios del usuario:
- 2 farmacias en Los Cabos (Cabo San Lucas y San José)
- 1 consultorio médico/IV drips para turistas en SJD
- 1 salón de eventos (Rancho McCoy) — bodas y eventos sociales
- 8 páginas digitales (e-commerce)

QUÉ BUSCAR:
1. Noticias de turismo en Los Cabos (llegadas, ocupación, temporada)
2. Eventos locales grandes (Fiestas, conciertos, deportes, conferencias)
3. Clima / huracanes / tormentas tropicales que afecten temporada
4. Cambios regulatorios (Salubridad, COFEPRIS, ayuntamiento)
5. Tipo de cambio USD/MXN si hay movimiento notable
6. Tendencias en redes (Reddit r/cabosanlucas, r/mexico, TikTok)
7. Competencia nueva o eventos virales
8. Cruceros llegando, vuelos cancelados, etc.
9. Eventos del Rancho McCoy o salones similares

FORMATO de salida JSON ESTRICTO:
{
  "insights": [
    {
      "tipo": "noticia" | "tendencia" | "riesgo" | "oportunidad" | "evento_local",
      "titulo": "Headline corto y claro",
      "resumen": "2-3 oraciones explicando qué pasa y por qué importa",
      "fuente": "Nombre del medio (ej: El Sudcaliforniano, Reddit r/cabosanlucas)",
      "fuente_url": "URL si la tienes",
      "impacto": "alta" | "media" | "baja",
      "aplica_a": ["farmacia" | "consultorio" | "rancho_mccoy" | "pagina_digital" | "general"],
      "recomendacion": "Una acción concreta que deberían tomar (1 frase)",
      "fecha_evento": "YYYY-MM-DD si aplica" | null
    }
  ]
}

REGLAS:
- Si no encuentras nada relevante, devuelve { "insights": [] }
- NUNCA inventes. Si no hay info verificable, omítelo.
- Cada insight debe tener una RECOMENDACIÓN específica (no genérica).
- aplica_a debe ser array con uno o más negocios.
- Prioriza información de los últimos 7 días.

Responde SOLO el JSON, sin markdown ni texto extra.`

/**
 * Ejecuta el radar usando OpenAI con web search (Responses API).
 * Devuelve insights actualizados.
 */
export async function ejecutarRadar(): Promise<{ insights: RadarInsight[]; error?: string }> {
  try {
    // Usar OpenAI Responses API con web_search_preview
    // (gpt-4o-mini soporta tool web_search_preview)
    type ResponsesAPI = {
      responses: {
        create: (args: unknown) => Promise<{ output_text?: string; output?: Array<{ type: string; content?: Array<{ text?: string; type?: string }> }> }>
      }
    }
    const oai = openai as unknown as ResponsesAPI
    if (!oai.responses) {
      return { insights: [], error: 'OpenAI Responses API no disponible' }
    }

    const response = await oai.responses.create({
      model: 'gpt-4o-mini',
      input: PROMPT_RADAR + '\n\nGenera el JSON con los insights más relevantes ahorita.',
      tools: [{ type: 'web_search_preview' }],
      tool_choice: 'auto',
    })

    // Extraer texto de la respuesta
    let raw = response.output_text ?? ''
    if (!raw && response.output) {
      for (const item of response.output) {
        if (item.type === 'message' && item.content) {
          for (const c of item.content) {
            if (c.type === 'output_text' && c.text) raw += c.text
          }
        }
      }
    }

    if (!raw) return { insights: [], error: 'Sin respuesta del modelo' }

    // Limpiar markdown si lo hay
    const trimmed = raw.trim()
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    const jsonStr = fence ? fence[1] : trimmed

    let parsed: { insights?: RadarInsight[] } = {}
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      return { insights: [], error: 'JSON inválido del modelo' }
    }

    return { insights: parsed.insights ?? [] }
  } catch (e) {
    return { insights: [], error: e instanceof Error ? e.message : 'Error desconocido' }
  }
}
