import { NextResponse } from 'next/server'
import { requireSocio } from '@/lib/auth/require-socio'
import { anthropic, CLAUDE_MODEL } from '@/lib/ai/anthropic'
import { openai, OPENAI_MODEL } from '@/lib/ai/openai'
import { getAIProvider } from '@/lib/ai/provider'
import { PROMPT_CHAT, type ChatMessage, type ChatDraft, type ChatGastoFijoDraft } from '@/lib/ai/prompts'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hoyEnCabos, inicioDelMesISO } from '@/lib/fechas'
import { totalizar, porCategoria } from '@/lib/agregaciones'
import { formatMoney } from '@/lib/utils'
import type Anthropic from '@anthropic-ai/sdk'
import type OpenAIType from 'openai'

export const runtime = 'nodejs'
export const maxDuration = 60

// =============================================================
// Tool: registrar_transaccion (común a ambos providers)
// =============================================================
const TOOL_PARAMS = {
  type: 'object' as const,
  properties: {
    tipo:           { type: 'string' as const, enum: ['ingreso', 'gasto'], description: 'Tipo de transacción' },
    monto:          { type: 'number' as const, description: 'Monto positivo' },
    moneda:         { type: 'string' as const, enum: ['MXN', 'USD'] },
    concepto:       { type: 'string' as const, description: 'Descripción corta' },
    negocio_nombre: { type: 'string' as const, description: 'Negocio, ej: "Cvu Pharmacy local"' },
    cuenta_nombre:  { type: 'string' as const, description: 'Cuenta, ej: "Mercado Pago Sergio"' },
    categoria:      { type: 'string' as const, description: 'Categoría' },
    metodo_pago:    { type: 'string' as const, description: 'mp_terminal, stripe, efectivo_mxn, etc.' },
    fecha:          { type: 'string' as const, description: 'YYYY-MM-DD, default hoy' },
    atribuido_a_nombre: { type: 'string' as const, description: 'SOLO para gastos de Casa que sean PERSONALES de un socio: "Miguel" o "Sergio". Si es compartido o no es Casa, déjalo vacío.' },
  },
  required: ['tipo', 'monto', 'concepto'],
}

const TOOL_DESC =
  'Llama esta tool cuando el usuario describa una transacción SUELTA (ingreso o gasto puntual, ej: "pagué 350 de gasolina"). Devuelve un DRAFT a confirmar. NO uses esta tool si el usuario está describiendo un gasto FIJO/RECURRENTE — para eso usa registrar_gasto_fijo.'

const GASTO_FIJO_PARAMS = {
  type: 'object' as const,
  properties: {
    nombre:                  { type: 'string' as const, description: 'Nombre del gasto fijo, ej: "Renta local farmacia"' },
    monto:                   { type: 'number' as const, description: 'Monto positivo' },
    moneda:                  { type: 'string' as const, enum: ['MXN', 'USD'] },
    frecuencia:              { type: 'string' as const, enum: ['mensual', 'quincenal', 'semanal', 'anual'] },
    dia_del_mes:             { type: 'number' as const, description: 'Día del mes en que se paga (1-31), solo si frecuencia=mensual' },
    proximo_pago:            { type: 'string' as const, description: 'YYYY-MM-DD opcional. Si no se da, se calcula' },
    negocio_nombre:          { type: 'string' as const, description: 'Negocio al que pertenece (ej: "Cvu Pharmacy local"). Vacío si es General' },
    cuenta_nombre:            { type: 'string' as const, description: 'Cuenta de donde sale el pago' },
    responsable_nombre:      { type: 'string' as const, description: '"Miguel" o "Sergio"' },
    proveedor:               { type: 'string' as const, description: 'A quién se paga (arrendador, empleado, CFE, etc.)' },
    metodo_pago:             { type: 'string' as const, description: 'transferencia, efectivo, domiciliado, etc.' },
    categoria:               { type: 'string' as const, description: 'renta, sueldo, servicios, etc.' },
    multa_por_no_pago:       { type: 'number' as const, description: 'Multa al responsable si no se marca pagado a tiempo. 0 si no aplica.' },
    comprobante_requerido:   { type: 'boolean' as const, description: 'Si true, pedirá foto al marcar pagado' },
  },
  required: ['nombre', 'monto', 'frecuencia'],
}

const GASTO_FIJO_TOOL_DESC =
  'Llama esta tool cuando el usuario describa un GASTO FIJO o RECURRENTE (renta, sueldo, servicio mensual, suscripción). Devuelve un DRAFT a confirmar. NO uses esta tool para transacciones puntuales — para eso usa registrar_transaccion.'

function buildDraft(input: Record<string, unknown>): ChatDraft {
  return {
    tipo: (input.tipo as 'gasto' | 'ingreso') ?? 'gasto',
    monto: Number(input.monto || 0),
    moneda: (input.moneda as 'MXN' | 'USD') || 'MXN',
    concepto: String(input.concepto || ''),
    categoria: (input.categoria as string) || null,
    negocio_sugerido: (input.negocio_nombre as string) || null,
    cuenta_sugerida: (input.cuenta_nombre as string) || null,
    metodo_pago: (input.metodo_pago as string) || null,
    fecha: (input.fecha as string) || hoyEnCabos(),
    atribuido_a_nombre: (input.atribuido_a_nombre as string) || null,
  }
}

function buildGastoFijoDraft(input: Record<string, unknown>): ChatGastoFijoDraft {
  return {
    nombre: String(input.nombre || ''),
    monto: Number(input.monto || 0),
    moneda: (input.moneda as 'MXN' | 'USD') || 'MXN',
    frecuencia: (input.frecuencia as 'mensual' | 'quincenal' | 'semanal' | 'anual') || 'mensual',
    dia_del_mes: input.dia_del_mes ? Number(input.dia_del_mes) : null,
    proximo_pago: (input.proximo_pago as string) || null,
    negocio_sugerido: (input.negocio_nombre as string) || null,
    cuenta_sugerida: (input.cuenta_nombre as string) || null,
    responsable_sugerido: (input.responsable_nombre as string) || null,
    proveedor: (input.proveedor as string) || null,
    metodo_pago: (input.metodo_pago as string) || null,
    categoria: (input.categoria as string) || null,
    multa_por_no_pago: input.multa_por_no_pago ? Number(input.multa_por_no_pago) : null,
    comprobante_requerido: Boolean(input.comprobante_requerido),
  }
}

// =============================================================
// Contexto del mes (inyectado al system prompt)
// =============================================================
async function construirContexto(admin: ReturnType<typeof createAdminClient>) {
  const desde = inicioDelMesISO()
  const hasta = hoyEnCabos()

  const [{ data: tx }, { data: negocios }, { data: cuentas }] = await Promise.all([
    admin.from('transacciones').select('tipo, monto, moneda, fecha, categoria, negocio_id').gte('fecha', desde).lte('fecha', hasta),
    admin.from('negocios').select('nombre, tipo, moneda_principal').eq('activo', true).order('nombre'),
    admin.from('cuentas').select('nombre, tipo, moneda').eq('activo', true).order('nombre'),
  ])

  const t = totalizar(tx ?? [])
  const top = porCategoria(tx ?? [], 5)

  const contextoMes = [
    `Resumen del mes (${desde} a ${hasta}):`,
    `- Ingresos MXN: ${formatMoney(t.ingresos_mxn, 'MXN')}${t.ingresos_usd > 0 ? `, USD ${formatMoney(t.ingresos_usd, 'USD')}` : ''}`,
    `- Gastos MXN: ${formatMoney(t.gastos_mxn, 'MXN')}${t.gastos_usd > 0 ? `, USD ${formatMoney(t.gastos_usd, 'USD')}` : ''}`,
    `- Utilidad MXN: ${formatMoney(t.utilidad_mxn, 'MXN')}`,
    `- Transacciones este mes: ${tx?.length ?? 0}`,
    `- Top categorías de gasto: ${top.map((c) => `${c.categoria} ${formatMoney(c.monto, 'MXN')}`).join(', ') || 'sin gastos categorizados'}`,
  ].join('\n')

  return {
    contexto: contextoMes,
    negocios: (negocios ?? []).map((n) => `"${n.nombre}" (${n.tipo}, ${n.moneda_principal})`).join(', '),
    cuentas: (cuentas ?? []).map((c) => `"${c.nombre}" (${c.moneda})`).join(', '),
  }
}

// =============================================================
// Loop OpenAI
// =============================================================
async function chatOpenAI(systemText: string, messages: ChatMessage[]) {
  let draft: ChatDraft | null = null
  let gastoFijoDraft: ChatGastoFijoDraft | null = null
  let finalReply = ''
  const MAX_ITERS = 3

  const oaiMessages: OpenAIType.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemText },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  for (let i = 0; i < MAX_ITERS; i++) {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: oaiMessages,
      tools: [
        {
          type: 'function',
          function: { name: 'registrar_transaccion', description: TOOL_DESC, parameters: TOOL_PARAMS },
        },
        {
          type: 'function',
          function: { name: 'registrar_gasto_fijo', description: GASTO_FIJO_TOOL_DESC, parameters: GASTO_FIJO_PARAMS },
        },
      ],
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens: 1024,
    })

    const msg = completion.choices[0]?.message
    if (!msg) break

    if (msg.content) finalReply = msg.content

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      break
    }

    oaiMessages.push({
      role: 'assistant',
      content: msg.content ?? '',
      tool_calls: msg.tool_calls,
    })

    for (const tc of msg.tool_calls) {
      if (tc.type !== 'function') continue
      let input: Record<string, unknown> = {}
      try { input = JSON.parse(tc.function.arguments || '{}') } catch {}

      if (tc.function.name === 'registrar_transaccion') {
        draft = buildDraft(input)
        oaiMessages.push({
          role: 'tool', tool_call_id: tc.id,
          content: `Draft transacción creado: ${draft.tipo} ${draft.monto} ${draft.moneda} (${draft.concepto}). Esperando confirmación.`,
        })
      } else if (tc.function.name === 'registrar_gasto_fijo') {
        gastoFijoDraft = buildGastoFijoDraft(input)
        oaiMessages.push({
          role: 'tool', tool_call_id: tc.id,
          content: `Draft gasto fijo creado: ${gastoFijoDraft.nombre} ${gastoFijoDraft.monto} ${gastoFijoDraft.moneda} ${gastoFijoDraft.frecuencia}. Esperando confirmación.`,
        })
      } else {
        oaiMessages.push({
          role: 'tool', tool_call_id: tc.id,
          content: `Tool ${tc.function.name} no implementada.`,
        })
      }
    }
  }

  return { reply: finalReply, draft, gastoFijoDraft }
}

// =============================================================
// Loop Anthropic (fallback / alternativa)
// =============================================================
async function chatAnthropic(systemText: string, messages: ChatMessage[]) {
  const tools: Anthropic.Tool[] = [
    { name: 'registrar_transaccion', description: TOOL_DESC, input_schema: TOOL_PARAMS },
    { name: 'registrar_gasto_fijo',  description: GASTO_FIJO_TOOL_DESC, input_schema: GASTO_FIJO_PARAMS },
  ]

  let draft: ChatDraft | null = null
  let gastoFijoDraft: ChatGastoFijoDraft | null = null
  let finalReply = ''
  const MAX_ITERS = 3
  const anMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  for (let i = 0; i < MAX_ITERS; i++) {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
      tools,
      messages: anMessages,
    })

    const textBlocks = response.content.filter((c): c is Anthropic.TextBlock => c.type === 'text')
    const toolUses = response.content.filter((c): c is Anthropic.ToolUseBlock => c.type === 'tool_use')
    finalReply = textBlocks.map((b) => b.text).join('\n').trim() || finalReply

    if (response.stop_reason !== 'tool_use' || toolUses.length === 0) break

    anMessages.push({ role: 'assistant', content: response.content })
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const t of toolUses) {
      if (t.name === 'registrar_transaccion') {
        draft = buildDraft(t.input as Record<string, unknown>)
        toolResults.push({ type: 'tool_result', tool_use_id: t.id, content: 'Draft transacción creado. Esperando confirmación.' })
      } else if (t.name === 'registrar_gasto_fijo') {
        gastoFijoDraft = buildGastoFijoDraft(t.input as Record<string, unknown>)
        toolResults.push({ type: 'tool_result', tool_use_id: t.id, content: 'Draft gasto fijo creado. Esperando confirmación.' })
      } else {
        toolResults.push({ type: 'tool_result', tool_use_id: t.id, content: 'No implementada.', is_error: true })
      }
    }
    anMessages.push({ role: 'user', content: toolResults })
  }

  return { reply: finalReply, draft, gastoFijoDraft }
}

// =============================================================
// POST
// =============================================================
export async function POST(req: Request) {
  try {
    const g = await requireSocio()
    if (g instanceof NextResponse) return g
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

    const provider = getAIProvider()
    const result = provider === 'anthropic'
      ? await chatAnthropic(systemText, body.messages)
      : await chatOpenAI(systemText, body.messages)

    return NextResponse.json({
      reply:
        result.reply ||
        (result.draft || result.gastoFijoDraft
          ? '✓ Listo, confirma en la tarjeta de abajo.'
          : '…'),
      draft: result.draft,
      gastoFijoDraft: result.gastoFijoDraft,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
