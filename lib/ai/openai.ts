import OpenAI from 'openai'

let client: OpenAI | undefined
export const openai = new Proxy({} as OpenAI, {
  get(_target, property) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no configurada en el servidor')
    client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const value = Reflect.get(client, property, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

// Modelo principal para vision + chat (función calling)
export const OPENAI_MODEL = 'gpt-4o-mini'
