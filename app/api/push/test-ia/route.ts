/**
 * Prueba on-demand: la IA (Claude) analiza la data + irregularidades,
 * redacta una observación y la manda como push al usuario actual.
 * Usa sesión del usuario (no requiere CRON_SECRET).
 */
import { NextResponse } from 'next/server'
import { requireSocio } from '@/lib/auth/require-socio'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ejecutarRadar } from '@/lib/ai/radar'
import { detectarIrregularidades } from '@/lib/ai/irregularidades'
import { enviarPushAProfiles } from '@/lib/push/server'
import { getAIProvider } from '@/lib/ai/provider'
import { openai, OPENAI_MODEL } from '@/lib/ai/openai'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'

export const runtime = 'nodejs'
export const maxDuration = 60

const SYSTEM = `Eres el cerebro financiero de Cabo Admin (Miguel y Sergio, negocios en Los Cabos).
Te paso insights e irregularidades de su data. Redacta UNA observación push:
- Máximo 140 caracteres
- Mexicano directo, útil, accionable
- Empieza con emoji
- NO inventes números, usa solo lo dado.
Responde SOLO el texto, nada más.`

export async function POST() {
  const g = await requireSocio()
  if (g instanceof NextResponse) return g
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const [radarRes, irregularidades] = await Promise.all([
    ejecutarRadar(),
    detectarIrregularidades(),
  ])

  const irregAltas = irregularidades.filter((i) => i.severidad === 'alta' || i.severidad === 'media')
  const top = (radarRes.insights ?? []).filter((i) => i.impacto === 'alta' || i.impacto === 'media').slice(0, 3)

  const provider = getAIProvider()

  // Si no hay nada que reportar, manda igual un mensaje de estado (es prueba)
  const insightsTexto = (irregAltas.length > 0 || top.length > 0)
    ? [
        ...irregAltas.map((i) => `- [IRREGULARIDAD ${i.severidad}] ${i.titulo}: ${i.detalle}`),
        ...top.map((i) => `- [${i.impacto}] ${i.titulo}: ${i.resumen}`),
      ].join('\n')
    : 'No hay irregularidades ni riesgos. Todo está en orden. Genera un mensaje motivador breve confirmando que el sistema está vigilando.'

  let mensaje = ''
  try {
    if (provider === 'anthropic') {
      const resp = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 100,
        system: SYSTEM,
        messages: [{ role: 'user', content: insightsTexto }],
      })
      const txt = resp.content.find((b) => b.type === 'text')
      mensaje = txt && txt.type === 'text' ? txt.text.trim() : ''
    } else {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: 100,
        temperature: 0.6,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: insightsTexto },
        ],
      })
      mensaje = completion.choices[0]?.message?.content?.trim() ?? ''
    }
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: `IA (${provider}) falló: ${e instanceof Error ? e.message : 'error'}`,
    })
  }

  if (!mensaje) mensaje = '🧠 Sistema activo y vigilando tus finanzas'

  // Push al usuario actual
  const res = await enviarPushAProfiles([user.id], {
    title: '🧠 Tu Auditor IA (prueba)',
    body: mensaje.slice(0, 160),
    url: '/auditor',
    tag: 'ia-test',
  })

  return NextResponse.json({
    ok: true,
    provider,
    modelo: provider === 'anthropic' ? CLAUDE_MODEL : OPENAI_MODEL,
    mensaje_ia: mensaje,
    push_enviados: res.enviados,
    irregularidades_detectadas: irregularidades.length,
    insights_detectados: (radarRes.insights ?? []).length,
  })
}
