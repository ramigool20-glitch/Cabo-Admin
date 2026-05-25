import OpenAI from 'openai'

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// Modelo principal para vision + chat (función calling)
export const OPENAI_MODEL = 'gpt-4o-mini'
