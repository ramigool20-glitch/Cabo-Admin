import Anthropic from '@anthropic-ai/sdk'

let client: Anthropic | undefined
export const anthropic = new Proxy({} as Anthropic, {
  get(_target, property) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY no configurada en el servidor')
    client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const value = Reflect.get(client, property, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

export const CLAUDE_MODEL = 'claude-sonnet-4-6'
