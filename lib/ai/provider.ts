/**
 * Configura qué proveedor de IA usar: 'openai' o 'anthropic'.
 * Por default es 'openai'. Cambiar AI_PROVIDER en .env.local para alternar.
 */
export type AIProvider = 'openai' | 'anthropic'

export function getAIProvider(): AIProvider {
  const v = process.env.AI_PROVIDER?.toLowerCase()
  return v === 'anthropic' ? 'anthropic' : 'openai'
}
