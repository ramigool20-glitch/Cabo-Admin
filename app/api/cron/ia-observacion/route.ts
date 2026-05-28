/**
 * Cron IA proactiva (Vercel Pro): 2-3 veces al día.
 * Analiza la data con el Radar determinístico, toma los insights más
 * importantes, y pide a la IA (Claude o GPT) que redacte UNA observación
 * corta y accionable. La manda como push a los socios.
 */
import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ejecutarRadar } from '@/lib/ai/radar'
import { enviarPushAProfiles } from '@/lib/push/server'
import { getAIProvider } from '@/lib/ai/provider'
import { openai, OPENAI_MODEL } from '@/lib/ai/openai'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'

export const runtime = 'nodejs'
export const maxDuration = 60

const SYSTEM = `Eres el cerebro financiero de Cabo Admin (Miguel y Sergio, negocios en Los Cabos).
Te paso insights detectados de su data. Redacta UNA sola observación push:
- Máximo 140 caracteres (es notificación de celular)
- Mexicano directo, útil, accionable
- Empieza con emoji que refleje el tono
- Si todo está bien, motiva. Si hay riesgo, alerta sin alarmar de más.
- NO inventes números: usa solo lo que está en los insights.
Responde SOLO el texto de la notificación, nada más.`

async function redactarPush(insightsTexto: string): Promise<string> {
  if (getAIProvider() === 'anthropic') {
    const resp = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 100,
      system: SYSTEM,
      messages: [{ role: 'user', content: insightsTexto }],
    })
    const txt = resp.content.find((b) => b.type === 'text')
    return txt && txt.type === 'text' ? txt.text.trim() : ''
  }
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: 100,
    temperature: 0.6,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: insightsTexto },
    ],
  })
  return completion.choices[0]?.message?.content?.trim() ?? ''
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // 1) Insights determinísticos (gratis)
  const { insights, error } = await ejecutarRadar()
  if (error) return NextResponse.json({ ok: false, error })
  if (insights.length === 0) {
    return NextResponse.json({ ok: true, skip: 'sin insights' })
  }

  // 2) Top insights (alta + media impacto) → texto para la IA
  const top = insights
    .filter((i) => i.impacto === 'alta' || i.impacto === 'media')
    .slice(0, 4)
  if (top.length === 0) {
    return NextResponse.json({ ok: true, skip: 'sin insights relevantes' })
  }
  const insightsTexto = top.map((i) => `- [${i.impacto}] ${i.titulo}: ${i.resumen}`).join('\n')

  // 3) IA redacta el push
  let mensaje = ''
  try {
    mensaje = await redactarPush(insightsTexto)
  } catch (e) {
    // Fallback: usa el título del insight más importante
    mensaje = `💡 ${top[0].titulo}`
  }
  if (!mensaje) mensaje = `💡 ${top[0].titulo}`

  // 4) Enviar push a socios
  const { data: socios } = await admin
    .from('profiles')
    .select('id, role_id, roles(nombre)')
    .eq('activo', true)
  const destinatarios = (socios ?? [])
    .filter((p) => {
      const r = p.roles as unknown as { nombre: string } | null
      return r?.nombre === 'admin' || r?.nombre === 'socio'
    })
    .map((p) => p.id)

  if (destinatarios.length === 0) {
    return NextResponse.json({ ok: true, skip: 'sin destinatarios' })
  }

  const res = await enviarPushAProfiles(destinatarios, {
    title: '🧠 Tu Auditor IA',
    body: mensaje.slice(0, 160),
    url: '/auditor',
    tag: 'ia-observacion',
  })

  return NextResponse.json({
    ok: true,
    mensaje,
    enviados: res.enviados,
    provider: getAIProvider(),
  })
}
