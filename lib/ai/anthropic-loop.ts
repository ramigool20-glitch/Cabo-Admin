import { anthropic, CLAUDE_MODEL } from './anthropic'
import type Anthropic from '@anthropic-ai/sdk'

// Tipo de tool en formato OpenAI (el que ya usa el auditor)
type OpenAITool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

type ChatMsg = { role: 'user' | 'assistant'; content: string }

/**
 * Convierte tools de formato OpenAI a formato Anthropic.
 */
function convertTools(tools: OpenAITool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
  }))
}

export type AnthropicLoopResult = {
  finalReply: string
  accionesEjecutadas: string[]
}

/**
 * Corre el loop agéntico con Claude:
 * - Usa prompt caching en system + tools (90% más barato en input repetido)
 * - Ejecuta tools via ejecutarTool callback
 * - Máximo maxIters iteraciones
 */
export async function runAnthropicLoop(args: {
  system: string
  mensajes: ChatMsg[]
  tools: OpenAITool[]
  ejecutarTool: (name: string, input: Record<string, unknown>) => Promise<string>
  maxIters?: number
  maxTokens?: number
}): Promise<AnthropicLoopResult> {
  const maxIters = args.maxIters ?? 4
  const anthropicTools = convertTools(args.tools)

  // Mensajes en formato Anthropic
  const messages: Anthropic.MessageParam[] = args.mensajes.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  let finalReply = ''
  const accionesEjecutadas: string[] = []

  for (let i = 0; i < maxIters; i++) {
    const resp = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: args.maxTokens ?? 1024,
      temperature: 0.4,
      // Prompt caching en el system para abaratar input repetido
      system: [
        {
          type: 'text',
          text: args.system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: anthropicTools,
      messages,
    })

    // Extraer texto y tool_use de la respuesta
    const textBlocks = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text')
    const toolUseBlocks = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')

    if (textBlocks.length > 0) {
      finalReply = textBlocks.map((b) => b.text).join('\n')
    }

    if (toolUseBlocks.length === 0) break  // no más tools, terminamos

    // Agregar respuesta del assistant (con sus tool_use)
    messages.push({ role: 'assistant', content: resp.content })

    // Ejecutar cada tool y armar tool_results
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const tu of toolUseBlocks) {
      const input = (tu.input ?? {}) as Record<string, unknown>
      const resultado = await args.ejecutarTool(tu.name, input)
      accionesEjecutadas.push(resultado)
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: resultado,
      })
    }

    // Agregar los resultados como mensaje de user
    messages.push({ role: 'user', content: toolResults })
  }

  return { finalReply, accionesEjecutadas }
}
