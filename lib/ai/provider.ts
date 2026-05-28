/**
 * Configura qué proveedor de IA usar: 'openai' o 'anthropic'.
 * Por default es 'openai'. Cambiar AI_PROVIDER en .env.local para alternar.
 */
export type AIProvider = 'openai' | 'anthropic'

export function getAIProvider(): AIProvider {
  const v = process.env.AI_PROVIDER?.toLowerCase().trim()
  // Explícito gana
  if (v === 'anthropic') return 'anthropic'
  if (v === 'openai') return 'openai'
  // Si no está seteado pero hay key de Anthropic, usa Claude (preferencia del proyecto)
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  return 'openai'
}
