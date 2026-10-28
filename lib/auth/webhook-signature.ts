import { createHmac, timingSafeEqual } from 'node:crypto'

export function validWhatsAppSignature(body: string, header: string | null, secret: string): boolean {
  if (!secret || !header || !/^sha256=[a-f0-9]{64}$/i.test(header)) return false
  const expected = createHmac('sha256', secret).update(body).digest()
  const actual = Buffer.from(header.slice(7), 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
