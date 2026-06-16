/**
 * Configura qué proveedor de IA usar: 'openai' o 'anthropic'.
 *
 * Preferencia del proyecto: **Anthropic Claude** (los prompts están diseñados
 * para Claude y los modelos 4.6/4.7 dan mejor calidad en captura por foto/voz,
 * sugerencia de categorización y auditor IA).
 *
 * Para FORZAR OpenAI (degradado intencional), setear:
 *   AI_PROVIDER=openai_forzado
 * en el env. Cualquier otro valor (incluido 'openai' a secas) cae al default
 * Claude si hay ANTHROPIC_API_KEY disponible.
 */
export type AIProvider = 'openai' | 'anthropic'

export function getAIProvider(): AIProvider {
  if (process.env.AI_PROVIDER === 'openai_forzado') return 'openai'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  return 'openai'
}
