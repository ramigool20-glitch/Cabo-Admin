/**
 * Analiza la foto de una checada con Claude Sonnet con visión.
 *
 * Detecta signos de:
 *   - Alcohol (ojos rojos, hinchados, mirada perdida)
 *   - Cansancio extremo (ojeras pronunciadas, demacrado)
 *   - Estado normal/apto
 *
 * Si detecta no_apto, dispara push notification a admin/socio.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'
import { enviarPushAProfiles } from '@/lib/push/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BodySchema = z.object({
  checada_id: z.string().uuid(),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Cargar checada con foto
  const { data: checada } = await admin
    .from('checadas')
    .select('id, profile_id, profile_nombre, tipo, timestamp_at, foto_url')
    .eq('id', parsed.data.checada_id)
    .single()
  if (!checada || !checada.foto_url) {
    return NextResponse.json({ error: 'Checada sin foto' }, { status: 404 })
  }

  // 2. Descargar foto del storage
  const { data: blob, error: dlErr } = await admin.storage
    .from('evidencias')
    .download(checada.foto_url as string)
  if (dlErr || !blob) {
    return NextResponse.json({ error: 'No se pudo descargar foto' }, { status: 500 })
  }
  const arrBuf = await blob.arrayBuffer()
  const base64 = Buffer.from(arrBuf).toString('base64')

  // 3. Llamar a Claude con visión
  const prompt = `Analiza esta foto de un empleado checando entrada/salida a su turno de trabajo en una farmacia/clínica en México.

Tu trabajo es detectar signos visibles de:
- ALCOHOL: ojos rojos, mirada perdida, párpados caídos, cara hinchada
- CANSANCIO EXTREMO: ojeras muy pronunciadas, demacrado, cara hundida, mirada vacía
- DROGAS: pupilas dilatadas/contraídas anormalmente, sudor excesivo, tics
- ENFERMEDAD: palidez extrema, fiebre visible, ojos llorosos
- NORMAL: aspecto fresco, alerta, descansado

Sé objetivo y honesto. Si la foto es muy oscura, borrosa o no se ve la cara claramente, indica "indeterminado".

Responde SOLO con un JSON válido, sin markdown, con esta forma exacta:

{
  "estado": "apto" | "precaucion" | "no_apto" | "indeterminado",
  "score": number (0-10, donde 10 = perfecto para trabajar, 0 = no debería trabajar),
  "observaciones": "string corto max 150 chars describiendo lo que ves",
  "alerta": boolean (true si admin debería revisarlo)
}`

  let resultado: { estado: string; score: number; observaciones: string; alerta: boolean } | null = null
  try {
    const resp = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: base64,
            },
          },
          { type: 'text', text: prompt },
        ],
      }],
    })
    const text = resp.content
      .flatMap(b => b.type === 'text' ? [b.text] : [])
      .join('\n')
      .trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      resultado = JSON.parse(jsonMatch[0])
    }
  } catch (e) {
    console.error('[analizar-checada] IA error:', e instanceof Error ? e.message : 'unknown')
    return NextResponse.json({ error: 'IA falló' }, { status: 500 })
  }

  if (!resultado) {
    return NextResponse.json({ error: 'IA no devolvió JSON válido' }, { status: 500 })
  }

  // 4. Guardar análisis en BD
  await admin
    .from('checadas')
    .update({
      analisis_estado: resultado.estado,
      analisis_score: Math.max(0, Math.min(10, Math.round(resultado.score))),
      analisis_observaciones: resultado.observaciones,
      analisis_alerta: resultado.alerta || resultado.estado === 'no_apto',
      analisis_at: new Date().toISOString(),
    })
    .eq('id', checada.id as string)

  // 5. Push a admin/socio si requiere alerta o no_apto
  if (resultado.alerta || resultado.estado === 'no_apto' || resultado.estado === 'precaucion') {
    try {
      const { data: admins } = await admin
        .from('profiles')
        .select('id, roles(nombre)')
        .eq('activo', true)
      const adminIds = (admins ?? [])
        .filter(p => {
          const r = (p.roles as unknown as { nombre: string } | null)?.nombre
          return r === 'admin' || r === 'socio'
        })
        .map(p => p.id as string)

      if (adminIds.length > 0) {
        const emoji = resultado.estado === 'no_apto' ? '🚨' : resultado.estado === 'precaucion' ? '⚠️' : 'ℹ️'
        const tipo = checada.tipo === 'entrada' ? 'llegó' : 'se fue'
        await enviarPushAProfiles(adminIds, {
          title: `${emoji} ${resultado.estado === 'no_apto' ? 'ALERTA' : 'Atención'} · ${checada.profile_nombre}`,
          body: `${tipo} · ${resultado.observaciones}`,
          url: '/checador/historial',
          tag: `analisis-${checada.id}`,
        })
      }
    } catch { /* silent */ }
  }

  return NextResponse.json({ ok: true, ...resultado })
}
