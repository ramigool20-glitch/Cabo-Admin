/**
 * Genera un push motivacional/estoico/gym/equipo con IA.
 * SOLO se manda como push — no se guarda en el feed del Auditor.
 */
import { getAIProvider } from '@/lib/ai/provider'
import { openai, OPENAI_MODEL } from '@/lib/ai/openai'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'

type Tema = { id: string; emoji: string; instruccion: string }

const TEMAS: Tema[] = [
  { id: 'estoico', emoji: '🏛️', instruccion: 'Una frase estoica (estilo Marco Aurelio, Séneca o Epicteto) aplicada a la disciplina de un emprendedor. Profunda pero corta.' },
  { id: 'gym', emoji: '💪', instruccion: 'Un empujón para ir al gym / cuidar el cuerpo y la energía. Cuerpo fuerte, mente fuerte, negocio fuerte.' },
  { id: 'equipo', emoji: '🤝', instruccion: 'Motivación de equipo para dos socios (Miguel y Sergio) que construyen negocios juntos en Los Cabos. Hermandad, lealtad, visión.' },
  { id: 'buenos_dias', emoji: '☀️', instruccion: 'Un buenos días con energía para arrancar el día atacando las metas.' },
  { id: 'enfoque', emoji: '🎯', instruccion: 'Recordatorio de enfoque: una cosa a la vez, ejecutar, no dispersarse.' },
  { id: 'cierre', emoji: '🌙', instruccion: 'Reflexión de cierre del día: lo que se midió, se mejora. Descansar para volver más fuerte.' },
]

const FALLBACK: Record<string, { title: string; body: string }> = {
  estoico: { title: '🏛️ Estoico', body: '"No es que tengamos poco tiempo, es que perdemos mucho." — Séneca. Ataquen lo importante hoy.' },
  gym: { title: '💪 Al gym, babys', body: 'Cuerpo fuerte, mente fría, negocio imparable. Muévanse aunque sean 30 min.' },
  equipo: { title: '🤝 Equipo Delta', body: 'Solos llegan rápido, juntos llegan lejos. A construir, Miguel y Sergio.' },
  buenos_dias: { title: '☀️ Buenos días', body: 'Cabo despierta y ustedes también. Hoy se gana. 🚀' },
  enfoque: { title: '🎯 Enfoque', body: 'Una cosa a la vez, bien hecha. Ejecuten.' },
  cierre: { title: '🌙 Cierre del día', body: 'Lo que se mide, se mejora. Descansen para volver más fuertes.' },
}

const SYSTEM = `Eres el coach del equipo Cabo Admin (Miguel y Sergio, socios con negocios en Los Cabos).
Escribe UNA notificación push motivacional, mexicana, directa y con buena vibra.
- Máximo 130 caracteres en el cuerpo.
- Devuelve SOLO un JSON: {"title":"<emoji + 2-3 palabras>","body":"<mensaje>"}
- Nada de explicaciones, solo el JSON.`

function pickTema(hourCabo: number): Tema {
  // Tarde/noche pesa a estoico/cierre/gym; resto aleatorio
  const pool = hourCabo >= 17 ? TEMAS.filter((t) => ['estoico', 'gym', 'cierre', 'equipo'].includes(t.id)) : TEMAS
  return pool[Math.floor(Math.random() * pool.length)]
}

export async function generarMensajeMotivacional(hourCabo: number): Promise<{ title: string; body: string }> {
  const tema = pickTema(hourCabo)
  try {
    const userMsg = `Tema: ${tema.instruccion} Usa el emoji ${tema.emoji} si encaja.`
    let raw = ''
    if (getAIProvider() === 'anthropic') {
      const resp = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 120,
        system: SYSTEM,
        messages: [{ role: 'user', content: userMsg }],
      })
      const txt = resp.content.find((b) => b.type === 'text')
      raw = txt && txt.type === 'text' ? txt.text : ''
    } else {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: 120,
        temperature: 0.95,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg }],
      })
      raw = completion.choices[0]?.message?.content ?? ''
    }
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0]) as { title?: string; body?: string }
      if (parsed.title && parsed.body) {
        return { title: parsed.title.slice(0, 60), body: parsed.body.slice(0, 160) }
      }
    }
  } catch {
    // cae al fallback
  }
  return FALLBACK[tema.id] ?? FALLBACK.buenos_dias
}
