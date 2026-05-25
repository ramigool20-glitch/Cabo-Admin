import { NextResponse } from 'next/server'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'
import { PROMPT_CHAT, type ChatMessage, type ChatDraft } from '@/lib/ai/prompts'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos, inicioDelMesISO } from '@/lib/fechas'
import { totalizar, porCategoria } from '@/lib/agregaciones'
import { formatMoney } from '@/lib/utils'
import type Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'registrar_transaccion',
    description:
      'Llama esta tool cuando el usuario describa una transacción (ingreso o gasto) que quiera registrar. Devuelve un DRAFT que el usuario confirmará en la UI. NO guarda directo. Si falta monto o concepto, pregunta antes de llamarla.',
    input_schema: {
      type: 'object',
      properties: {
        tipo:           { type: 'string', enum: ['ingreso', 'gasto'], description: 'Tipo de transacción' },
        monto:          { type: 'number', description: 'Monto positivo' },
        moneda:         { type: 'string', enum: ['MXN', 'USD'] },
        concepto:       { type: 'string', description: 'Descripción corta de la transacción' },
        negocio_nombre: { type: 'string', description: 'Nombre del negocio mencionado, ej: "Cvu Pharmacy local"' },
        cuenta_nombre:  { type: 'string', description: 'Cuenta usada, ej: "Mercado Pago Sergio"' },
        categoria:      { type: 'string', description: 'Categoría: ads, renta, sueldo, gasolina, etc.' },
        metodo_pago:    { type: 'string', description: 'mp_terminal, stripe, efectivo_mxn, etc.' },
        fecha:          { type: 'string', description: 'YYYY-MM-DD. Si no se menciona, usa hoy.' },
      },
      required: ['tipo', 'monto', 'concepto'],
    },
  },
]

async function construirContexto(supabase: ReturnType<typeof createAdminClient>) {
  const desde = inicioDelMesISO()
  const hasta = hoyEnCabos()

  const [{ data: tx }, { data: negocios }, { data: cuentas }] = await Promise.all([
    supabase.from('transacciones').select('tipo, monto, moneda, fecha, categoria, negocio_id').gte('fecha', desde).lte('fecha', hasta),
    supabase.from('negocios').select('nombre, tipo, moneda_principal').eq('activo', true).order('nombre'),
    supabase.from('cuentas').select('nombre, tipo, moneda').eq('activo', true).order('nombre'),
  ])

  const t = totalizar(tx ?? [])
  const top = porCategoria(tx ?? [], 5)

  const contextoMes = [
    `Resumen del mes (${desde} a ${hasta}):`,
    `- Ingresos MXN: ${formatMoney(t.ingresos_mxn, 'MXN')}${t.ingresos_usd > 0 ? `, USD ${formatMoney(t.ingresos_usd, 'USD')}` : ''}`,
    `- Gastos MXN: ${formatMoney(t.gastos_mxn, 'MXN')}${t.gastos_usd > 0 ? `, USD ${formatMoney(t.gastos_usd, 'USD')}` : ''}`,
    `- Utilidad MXN: ${formatMoney(t.utilidad_mxn, 'MXN')}`,
    `- Transacciones registradas este mes: ${tx?.length ?? 0}`,
    `- Top categorías de gasto: ${top.map((c) => `${c.categoria} ${formatMoney(c.monto, 'MXN')}`).join(', ') || 'sin gastos categorizados'}`,
  ].join('\n')

  const negociosStr = (negocios ?? []).map((n) => `"${n.nombre}" (${n.tipo}, ${n.moneda_principal})`).join(', ')
  const cuentasStr = (cuentas ?? []).map((c) => `"${c.nombre}" (${c.moneda})`).join(', ')

  return {
    contexto: contextoMes,
    negocios: negociosStr,
    cuentas: cuentasStr,
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const body = (await req.json()) as { messages: ChatMessage[] }
    if (!body.messages?.length) {
      return NextResponse.json({ error: 'Faltan mensajes' }, { status: 400 })
    }

    const admin = createAdminClient()
    const ctx = await construirContexto(admin)

    const systemText = PROMPT_CHAT
      .replace('{CONTEXTO}', ctx.contexto)
      .replace('{FECHA_HOY}', hoyEnCabos())
      .replace('{NEGOCIOS}', ctx.negocios)
      .replace('{CUENTAS}', ctx.cuentas)

    // Loop de tool use (máximo 3 iteraciones)
    const messages: Anthropic.MessageParam[] = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    let draft: ChatDraft | null = null
    let finalReply = ''
    let iters = 0
    const MAX_ITERS = 3

    while (iters < MAX_ITERS) {
      iters++
      const response = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
      })

      // Extraer respuesta de texto y tool uses
      const textBlocks = response.content.filter((c): c is Anthropic.TextBlock => c.type === 'text')
      const toolUses = response.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')

      finalReply = textBlocks.map((b) => b.text).join('\n').trim() || finalReply

      if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
        break
      }

      // Procesar tool uses
      messages.push({ role: 'assistant', content: response.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const t of toolUses) {
        if (t.name === 'registrar_transaccion') {
          const input = t.input as Record<string, unknown>
          // Construir draft
          draft = {
            tipo: (input.tipo as 'gasto' | 'ingreso') ?? 'gasto',
            monto: Number(input.monto || 0),
            moneda: (input.moneda as 'MXN' | 'USD') || 'MXN',
            concepto: String(input.concepto || ''),
            categoria: (input.categoria as string) || null,
            negocio_sugerido: (input.negocio_nombre as string) || null,
            cuenta_sugerida: (input.cuenta_nombre as string) || null,
            metodo_pago: (input.metodo_pago as string) || null,
            fecha: (input.fecha as string) || hoyEnCabos(),
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: t.id,
            content: `Draft creado: ${draft.tipo} de ${draft.monto} ${draft.moneda} (${draft.concepto}). Esperando confirmación del usuario en la UI.`,
          })
        } else {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: t.id,
            content: `Tool ${t.name} no implementada.`,
            is_error: true,
          })
        }
      }

      messages.push({ role: 'user', content: toolResults })
    }

    return NextResponse.json({
      reply: finalReply || (draft ? '✓ Listo, confirma en la tarjeta de abajo.' : 'Procesando…'),
      draft,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
