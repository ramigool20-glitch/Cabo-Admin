/**
 * Cron IA proactiva (Vercel Pro): 10am / 6pm / 9pm Cabo.
 * 1) Construye observaciones desde datos REALES (irregularidades + radar).
 * 2) Las persiste en auditor_observaciones (feed por gravedad, dedupe por clave).
 * 3) Genera preguntas de datos faltantes.
 * 4) Si hay observaciones NUEVAS relevantes, la IA redacta un push (usando su
 *    memoria como contexto) y lo manda a los socios. Abre el feed del Auditor.
 */
import { NextResponse } from 'next/server'
import { isAuthorizedCron } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { construirObservaciones, persistirObservaciones, generarPreguntasDatosFaltantes } from '@/lib/ai/observaciones'
import { enviarPushAProfiles } from '@/lib/push/server'
import { getAIProvider } from '@/lib/ai/provider'
import { openai, OPENAI_MODEL } from '@/lib/ai/openai'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'

export const runtime = 'nodejs'
export const maxDuration = 60

const SYSTEM = `Eres el Auditor IA de Cabo Admin (Miguel y Sergio, negocios en Los Cabos).
Te paso observaciones detectadas de SU data real (no inventes nada, usa solo lo que está).
Redacta UNA notificación push:
- Máximo 150 caracteres.
- Mexicano directo, agresivo pero útil, accionable.
- Empieza con emoji. Prioriza lo más grave.
- Si tienes "memoria" del equipo, úsala para sonar más contextual.
Responde SOLO el texto de la notificación.`

async function redactarPush(insightsTexto: string, memoria: string): Promise<string> {
  const userMsg = memoria
    ? `MEMORIA DEL EQUIPO:\n${memoria}\n\nOBSERVACIONES DE HOY:\n${insightsTexto}`
    : insightsTexto
  if (getAIProvider() === 'anthropic') {
    const resp = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 120,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMsg }],
    })
    const txt = resp.content.find((b) => b.type === 'text')
    return txt && txt.type === 'text' ? txt.text.trim() : ''
  }
  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: 120,
    temperature: 0.6,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userMsg },
    ],
  })
  return completion.choices[0]?.message?.content?.trim() ?? ''
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // 1+2) Observaciones de datos reales → persistir (dedupe por clave)
  const obs = await construirObservaciones()
  const persist = await persistirObservaciones(obs)
  if (!persist.ok) {
    return NextResponse.json({ ok: false, error: persist.error })
  }

  // 3) Preguntas de datos faltantes
  const preguntasCreadas = await generarPreguntasDatosFaltantes()

  // 4) Solo notificar lo NUEVO relevante (evita spam de lo mismo)
  const relevantes = persist.nuevas.filter((o) => o.severidad === 'grave' || o.severidad === 'atencion')
  if (relevantes.length === 0) {
    return NextResponse.json({ ok: true, persistidas: obs.length, nuevas: 0, preguntas: preguntasCreadas })
  }

  // Memoria como contexto
  const { data: mem } = await admin
    .from('memoria_ia')
    .select('contenido, importancia')
    .eq('activa', true)
    .order('importancia', { ascending: false })
    .limit(8)
  const memoria = (mem ?? []).map((m) => `- ${m.contenido}`).join('\n')

  const insightsTexto = relevantes
    .sort((a, b) => (a.severidad === 'grave' ? -1 : 1) - (b.severidad === 'grave' ? -1 : 1))
    .map((o) => `- [${o.severidad}] ${o.titulo}: ${o.detalle ?? ''}`)
    .join('\n')

  const fallbackTitulo = relevantes.find((o) => o.severidad === 'grave')?.titulo ?? relevantes[0].titulo
  let mensaje = ''
  try {
    mensaje = await redactarPush(insightsTexto, memoria)
  } catch {
    mensaje = `🧠 ${fallbackTitulo}`
  }
  if (!mensaje) mensaje = `🧠 ${fallbackTitulo}`

  // 5) Push a socios
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

  let enviados = 0
  if (destinatarios.length > 0) {
    const res = await enviarPushAProfiles(destinatarios, {
      title: '🧠 Tu Auditor IA',
      body: mensaje.slice(0, 170),
      url: '/auditor',
      tag: 'ia-observacion',
    })
    enviados = res.enviados
  }

  return NextResponse.json({
    ok: true,
    persistidas: obs.length,
    nuevas: relevantes.length,
    preguntas: preguntasCreadas,
    mensaje,
    enviados,
    provider: getAIProvider(),
  })
}
